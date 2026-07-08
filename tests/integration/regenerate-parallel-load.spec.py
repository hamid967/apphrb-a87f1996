"""
Integration test: high-load parallel regeneration across dozens of
companies that share near-identical metadata must never produce a
duplicate establishment_no.

Setup:
  - Create one org and N companies with the SAME name, legal_name, and
    created_by; each row is otherwise a fresh UUID.
  - Open N asyncpg connections, one per company.

Load:
  - Each connection opens its own transaction, sets admin JWT claims, and
    fires admin_regenerate_establishment_no against its company.
  - All N calls are launched together via asyncio.gather so they race
    through nextval + UPDATE + audit_log INSERT in parallel.

Assertions (all must hold):
  A. All N calls return values matching ^HBS-[0-9]{6,}$.
  B. All N returned values are pairwise distinct.
  C. Case-insensitive uniqueness across all N returned values.
  D. Every company row now holds its own returned value.
  E. No other live company in the DB shares any of the N returned values
     (case-insensitive).
  F. audit_log recorded exactly one regeneration entry per company.

Run:
  python3 tests/integration/regenerate-parallel-load.spec.py
"""

import asyncio
import json
import os
import re
import sys
import uuid

import asyncpg  # type: ignore

N_COMPANIES = 40

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


async def regen_one(conn: asyncpg.Connection, admin_id: str, co_id: uuid.UUID,
                    barrier: asyncio.Event) -> str:
    tx = conn.transaction()
    await tx.start()
    await set_admin_claim(conn, admin_id)
    await barrier.wait()  # release all workers simultaneously
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
    obs = await asyncpg.connect(**DSN)

    admin_id = str(await setup.fetchval(
        "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1"
    ))
    org_id = uuid.uuid4()
    company_ids = [uuid.uuid4() for _ in range(N_COMPANIES)]
    name = "Load Twin Co"
    legal = "Load Twin Legal LLC"

    async with setup.transaction():
        await set_admin_claim(setup, admin_id)
        await setup.execute(
            "INSERT INTO public.organizations(id, name, slug, created_by) "
            "VALUES ($1, $2, $3, $4)",
            org_id, "Load Twin Org", f"lto-{str(org_id)[:8]}", admin_id,
        )
        # Bulk insert twin rows in one round-trip.
        await setup.executemany(
            "INSERT INTO public.companies(id, org_id, name, legal_name, created_by) "
            "VALUES ($1, $2, $3, $4, $5)",
            [(cid, org_id, name, legal, admin_id) for cid in company_ids],
        )

    conns: list[asyncpg.Connection] = []
    try:
        conns = await asyncio.gather(*[asyncpg.connect(**DSN) for _ in company_ids])

        barrier = asyncio.Event()
        tasks = [
            asyncio.create_task(regen_one(c, admin_id, cid, barrier))
            for c, cid in zip(conns, company_ids)
        ]
        # Give every worker time to reach `barrier.wait()`, then release all.
        await asyncio.sleep(0.2)
        barrier.set()

        results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=60.0)

        fmt = re.compile(r"^HBS-[0-9]{6,}$")
        malformed = [v for v in results if not fmt.match(v)]
        record(not malformed,
               f"all {N_COMPANIES} returned values match HBS-######",
               f"malformed={malformed[:5]}")

        record(len(set(results)) == N_COMPANIES,
               f"all {N_COMPANIES} returned values are distinct",
               f"returned={len(results)} distinct={len(set(results))}")

        record(len({v.upper() for v in results}) == N_COMPANIES,
               "returned values are distinct case-insensitively",
               f"ci_distinct={len({v.upper() for v in results})}")

        rows = await obs.fetch(
            "SELECT id, establishment_no FROM public.companies "
            "WHERE id = ANY($1::uuid[])",
            company_ids,
        )
        db_map = {r["id"]: r["establishment_no"] for r in rows}
        expected = dict(zip(company_ids, results))
        record(db_map == expected,
               "every company row reflects its own returned value",
               f"mismatches={sum(1 for k,v in expected.items() if db_map.get(k)!=v)}")

        collisions = await obs.fetchval(
            """
            SELECT count(*) FROM public.companies
             WHERE deleted_at IS NULL
               AND id <> ALL($1::uuid[])
               AND upper(establishment_no) = ANY(SELECT upper(x) FROM unnest($2::text[]) x)
            """,
            company_ids, results,
        )
        record(collisions == 0,
               "no other live company shares any of the load values",
               f"collisions={collisions}")

        audit_counts = await obs.fetch(
            """
            SELECT entity_id, count(*) AS n
              FROM public.audit_log
             WHERE entity='companies'
               AND action='regenerate_establishment_no'
               AND entity_id = ANY($1::uuid[])
             GROUP BY entity_id
            """,
            company_ids,
        )
        per_co = {r["entity_id"]: r["n"] for r in audit_counts}
        record(
            len(per_co) == N_COMPANIES and all(n == 1 for n in per_co.values()),
            f"audit_log recorded exactly one entry per company (n={N_COMPANIES})",
            f"logged_companies={len(per_co)} bad_counts={[n for n in per_co.values() if n!=1][:5]}",
        )
    finally:
        try:
            async with setup.transaction():
                await setup.execute(
                    "DELETE FROM public.audit_log WHERE entity='companies' "
                    "AND entity_id = ANY($1::uuid[])",
                    company_ids,
                )
                await setup.execute(
                    "DELETE FROM public.companies WHERE id = ANY($1::uuid[])",
                    company_ids,
                )
                await setup.execute("DELETE FROM public.organizations WHERE id=$1", org_id)
        except Exception as e:
            msgs.append(f"note — cleanup skipped ({e!s})")
        for c in conns:
            await c.close()
        await obs.close(); await setup.close()

    for m in msgs: print(m)
    print(f"summary — {ok}/{ok+bad} passed")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))