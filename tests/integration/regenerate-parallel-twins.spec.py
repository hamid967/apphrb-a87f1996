"""
Integration test: parallel regeneration on TWO companies that share
near-identical metadata (same org, same name, same legal_name, same
created_by) must still yield distinct establishment_no values — the
uniqueness contract is on the number itself, independent of metadata.

Strategy:
  1. Create org + two "twin" companies (identical name/legal_name).
  2. Open two async connections; each opens its own transaction, sets
     admin JWT claims, and fires admin_regenerate_establishment_no
     against ITS company in parallel via asyncio.gather.
  3. Commit both, then assert:
       A. Both calls returned values matching ^HBS-[0-9]{6,}$.
       B. The two returned values are distinct.
       C. The two rows in public.companies now hold those two values.
       D. The case-insensitive unique index accepts them (no collision
          on upper(establishment_no) across the twins or with any other
          live company).
       E. audit_log recorded one regeneration per twin.

Run:
  python3 tests/integration/regenerate-parallel-twins.spec.py
"""

import asyncio
import json
import os
import re
import sys
import uuid

import asyncpg  # type: ignore

DSN = {
    "host": os.environ["PGHOST"],
    "port": int(os.environ.get("PGPORT", "5432")),
    "user": os.environ["PGUSER"],
    "password": os.environ["PGPASSWORD"],
    "database": os.environ["PGDATABASE"],
    "statement_cache_size": 0,  # pgbouncer transaction pooling
}


async def set_admin_claim(conn: asyncpg.Connection, admin_id: str) -> None:
    await conn.execute(
        "SELECT set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": admin_id, "role": "authenticated"}),
    )


async def regen(conn: asyncpg.Connection, admin_id: str, co_id: uuid.UUID) -> str:
    tx = conn.transaction()
    await tx.start()
    await set_admin_claim(conn, admin_id)
    try:
        val = await conn.fetchval(
            "SELECT public.admin_regenerate_establishment_no($1)", co_id
        )
        await tx.commit()
        return val
    except Exception:
        await tx.rollback()
        raise


async def main() -> int:
    ok = bad = 0
    msgs: list[str] = []

    def record(cond: bool, label: str, detail: str = "") -> None:
        nonlocal ok, bad
        if cond:
            ok += 1; msgs.append(f"PASS — {label}")
        else:
            bad += 1; msgs.append(f"FAIL — {label}{(' :: ' + detail) if detail else ''}")

    setup = await asyncpg.connect(**DSN)
    a = await asyncpg.connect(**DSN)
    b = await asyncpg.connect(**DSN)
    obs = await asyncpg.connect(**DSN)

    admin_id = str(await setup.fetchval(
        "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1"
    ))
    org_id = uuid.uuid4()
    co_x = uuid.uuid4()
    co_y = uuid.uuid4()
    twin_name = "Twin Co"
    twin_legal = "Twin Legal LLC"

    async with setup.transaction():
        await set_admin_claim(setup, admin_id)
        await setup.execute(
            "INSERT INTO public.organizations(id, name, slug, created_by) "
            "VALUES ($1, $2, $3, $4)",
            org_id, "Twin Regen Org", f"tro-{str(org_id)[:8]}", admin_id,
        )
        for cid in (co_x, co_y):
            await setup.execute(
                "INSERT INTO public.companies(id, org_id, name, legal_name, created_by) "
                "VALUES ($1, $2, $3, $4, $5)",
                cid, org_id, twin_name, twin_legal, admin_id,
            )

    try:
        # Parallel regen: both start together via asyncio.gather.
        x_val, y_val = await asyncio.gather(
            regen(a, admin_id, co_x),
            regen(b, admin_id, co_y),
        )

        fmt = re.compile(r"^HBS-[0-9]{6,}$")
        record(bool(fmt.match(x_val) and fmt.match(y_val)),
               "both returned values match HBS-######", f"x={x_val} y={y_val}")
        record(x_val != y_val,
               "parallel twins receive distinct establishment_no",
               f"x={x_val} y={y_val}")

        # DB reflects the returned values.
        db_x = await obs.fetchval("SELECT establishment_no FROM public.companies WHERE id=$1", co_x)
        db_y = await obs.fetchval("SELECT establishment_no FROM public.companies WHERE id=$1", co_y)
        record(db_x == x_val and db_y == y_val,
               "companies rows reflect the returned values",
               f"db_x={db_x} db_y={db_y}")

        # Case-insensitive collision check across ALL live companies.
        collisions = await obs.fetchval(
            """
            SELECT count(*) FROM public.companies
             WHERE deleted_at IS NULL
               AND id NOT IN ($1, $2)
               AND upper(establishment_no) IN (upper($3), upper($4))
            """,
            co_x, co_y, x_val, y_val,
        )
        record(collisions == 0,
               "no other live company shares either twin's est_no (case-insensitive)",
               f"collisions={collisions}")

        # Audit log entries per twin.
        n_x = await obs.fetchval(
            "SELECT count(*) FROM public.audit_log "
            "WHERE entity='companies' AND entity_id=$1 AND action='regenerate_establishment_no'",
            co_x,
        )
        n_y = await obs.fetchval(
            "SELECT count(*) FROM public.audit_log "
            "WHERE entity='companies' AND entity_id=$1 AND action='regenerate_establishment_no'",
            co_y,
        )
        record(n_x == 1 and n_y == 1,
               "audit_log recorded one regeneration per twin",
               f"n_x={n_x} n_y={n_y}")
    finally:
        try:
            async with setup.transaction():
                await setup.execute(
                    "DELETE FROM public.audit_log WHERE entity='companies' AND entity_id = ANY($1::uuid[])",
                    [co_x, co_y],
                )
                await setup.execute("DELETE FROM public.companies WHERE id = ANY($1::uuid[])", [co_x, co_y])
                await setup.execute("DELETE FROM public.organizations WHERE id=$1", org_id)
        except Exception as e:
            msgs.append(f"note — cleanup skipped ({e!s})")
        for c in (a, b, obs, setup):
            await c.close()

    for m in msgs: print(m)
    print(f"summary — {ok}/{ok+bad} passed")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))