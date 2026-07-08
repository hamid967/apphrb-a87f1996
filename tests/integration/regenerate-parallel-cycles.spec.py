"""
Integration test: run parallel regeneration in multiple cycles, with a
short sleep between cycles, and verify that no establishment_no repeats
across ALL cycles combined.

A single "cycle" fires N parallel admin_regenerate_establishment_no
calls (one per connection) against N twin companies, released together
via an asyncio.Event barrier. Between cycles the test sleeps briefly to
let any leftover locks / background workers settle before the next
burst starts.

Cumulative assertions (over CYCLES rounds of N calls each):
  A. Every returned value across every cycle matches ^HBS-[0-9]{6,}$.
  B. All N * CYCLES returned values are pairwise distinct.
  C. All N * CYCLES values are distinct case-insensitively.
  D. After the last cycle, each of the N companies holds its own
     last-cycle value in the DB.
  E. audit_log recorded exactly CYCLES regeneration entries per company.
  F. No other live company shares any of the values produced across
     any cycle.

Run:
  python3 tests/integration/regenerate-parallel-cycles.spec.py
"""

import asyncio
import json
import os
import re
import sys
import uuid

import asyncpg  # type: ignore

N_COMPANIES = 20
CYCLES = 5
SLEEP_BETWEEN = 0.25  # seconds

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
    await barrier.wait()
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

    async with setup.transaction():
        await set_admin_claim(setup, admin_id)
        await setup.execute(
            "INSERT INTO public.organizations(id, name, slug, created_by) "
            "VALUES ($1, $2, $3, $4)",
            org_id, "Cycles Twin Org", f"cto-{str(org_id)[:8]}", admin_id,
        )
        await setup.executemany(
            "INSERT INTO public.companies(id, org_id, name, legal_name, created_by) "
            "VALUES ($1, $2, $3, $4, $5)",
            [(cid, org_id, "Cycles Twin Co", "Cycles Twin Legal LLC", admin_id)
             for cid in company_ids],
        )

    conns: list[asyncpg.Connection] = []
    all_values: list[str] = []
    last_cycle_map: dict[uuid.UUID, str] = {}
    try:
        conns = await asyncio.gather(*[asyncpg.connect(**DSN) for _ in company_ids])

        for cycle in range(1, CYCLES + 1):
            barrier = asyncio.Event()
            tasks = [
                asyncio.create_task(regen_one(c, admin_id, cid, barrier))
                for c, cid in zip(conns, company_ids)
            ]
            await asyncio.sleep(0.1)  # let all workers reach the barrier
            barrier.set()
            results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=60.0)
            all_values.extend(results)
            last_cycle_map = dict(zip(company_ids, results))
            msgs.append(f"note — cycle {cycle}/{CYCLES} produced {len(results)} values")
            if cycle < CYCLES:
                await asyncio.sleep(SLEEP_BETWEEN)

        fmt = re.compile(r"^HBS-[0-9]{6,}$")
        malformed = [v for v in all_values if not fmt.match(v)]
        expected_total = N_COMPANIES * CYCLES
        record(not malformed,
               f"all {expected_total} values across {CYCLES} cycles match HBS-######",
               f"malformed={malformed[:5]}")

        record(len(set(all_values)) == expected_total,
               f"all {expected_total} values pairwise distinct across cycles",
               f"distinct={len(set(all_values))}/{expected_total}")

        record(len({v.upper() for v in all_values}) == expected_total,
               "cumulative values are distinct case-insensitively",
               f"ci_distinct={len({v.upper() for v in all_values})}")

        rows = await obs.fetch(
            "SELECT id, establishment_no FROM public.companies "
            "WHERE id = ANY($1::uuid[])",
            company_ids,
        )
        db_map = {r["id"]: r["establishment_no"] for r in rows}
        record(db_map == last_cycle_map,
               "each company holds its last-cycle value in the DB",
               f"mismatches={sum(1 for k,v in last_cycle_map.items() if db_map.get(k)!=v)}")

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
            len(per_co) == N_COMPANIES and all(n == CYCLES for n in per_co.values()),
            f"audit_log recorded exactly {CYCLES} entries per company",
            f"logged_companies={len(per_co)} bad_counts={[n for n in per_co.values() if n!=CYCLES][:5]}",
        )

        collisions = await obs.fetchval(
            """
            SELECT count(*) FROM public.companies
             WHERE deleted_at IS NULL
               AND id <> ALL($1::uuid[])
               AND upper(establishment_no) = ANY(SELECT upper(x) FROM unnest($2::text[]) x)
            """,
            company_ids, all_values,
        )
        record(collisions == 0,
               "no other live company shares any cumulative value",
               f"collisions={collisions}")
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