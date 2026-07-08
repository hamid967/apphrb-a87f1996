"""
Integration test: concurrent admin_regenerate_establishment_no calls against
the SAME company must be serialized by transaction row-level locking, so two
overlapping requests can never observe or produce the same establishment_no.

The regeneration function performs, inside a single (implicit or explicit)
transaction:

    v_new := 'HBS-' || lpad(nextval(...)::text, 6, '0');
    UPDATE public.companies SET establishment_no = v_new WHERE id = _company_id;

Two guarantees combine to prevent collision:
  (1) nextval() is atomic and never returns the same value twice, so v_new
      is globally unique across concurrent callers.
  (2) The UPDATE takes a Postgres row-level FOR UPDATE lock on the target
      companies row for the duration of the caller's transaction. A second
      concurrent transaction hitting the same row BLOCKS on that lock until
      the first commits, then runs on the post-commit row.

This test drives two long-lived async connections in true parallel:

  T1: BEGIN; call regen; hold the transaction open (row lock held)
  T2: BEGIN; call regen  <-- MUST block on T1's row lock
  main: wait, then observe pg_stat_activity to confirm T2 is blocked
        by T1 (wait_event_type='Lock', blocking_pids includes T1)
  T1: COMMIT
  T2: (unblocks, completes) COMMIT

Assertions:
  A. While T1 holds the row, T2 is actually blocked on a transaction/tuple
     lock whose blocker is T1 — proves the lock exists (not just wishful
     serialization by chance).
  B. T1's returned est_no != T2's returned est_no.
  C. The final DB value is T2's est_no (last committer wins) and matches
     ^HBS-[0-9]{{6,}}$.
  D. audit_log records exactly two regeneration entries for this company,
     one per transaction, in commit order.

All fixture rows are inserted in a separate cleanup transaction that runs
at the end with the same admin identity, so nothing persists.

Run:
  python3 tests/integration/regenerate-locking.spec.py
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
    claims = json.dumps({"sub": admin_id, "role": "authenticated"})
    # request.jwt.claims must be set inside the same transaction it's used in
    # (SET LOCAL). Callers pass an already-open transaction.
    await conn.execute("SELECT set_config('request.jwt.claims', $1, true)", claims)


async def main() -> int:
    ok = bad = 0
    msgs: list[str] = []

    def record(cond: bool, label: str, detail: str = "") -> None:
        nonlocal ok, bad
        if cond:
            ok += 1
            msgs.append(f"PASS — {label}")
        else:
            bad += 1
            msgs.append(f"FAIL — {label}{(' :: ' + detail) if detail else ''}")

    setup = await asyncpg.connect(**DSN)
    t1 = await asyncpg.connect(**DSN)
    t2 = await asyncpg.connect(**DSN)
    observer = await asyncpg.connect(**DSN)

    admin_id = await setup.fetchval(
        "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1"
    )
    assert admin_id, "need admin in user_roles"

    org_id = uuid.uuid4()
    co_id = uuid.uuid4()

    # Setup fixture in its own transaction, then commit so the two workers
    # can lock the row. Cleanup happens at the end via admin identity.
    async with setup.transaction():
        await set_admin_claim(setup, str(admin_id))
        await setup.execute(
            "INSERT INTO public.organizations(id, name, slug, created_by) "
            "VALUES ($1, $2, $3, $4)",
            org_id, "Regen Locking Org", f"rlo-{str(org_id)[:8]}", admin_id,
        )
        await setup.execute(
            "INSERT INTO public.companies(id, org_id, name, created_by) "
            "VALUES ($1, $2, $3, $4)",
            co_id, org_id, "Regen Locking Co", admin_id,
        )

    try:
        # --- T1 opens txn, regens (grabs row lock), stays open ---
        tx1 = t1.transaction()
        await tx1.start()
        await set_admin_claim(t1, str(admin_id))
        t1_pid = await t1.fetchval("SELECT pg_backend_pid()")
        t1_est = await t1.fetchval(
            "SELECT public.admin_regenerate_establishment_no($1)", co_id
        )

        # --- T2 opens txn and fires regen concurrently; it should BLOCK ---
        tx2 = t2.transaction()
        await tx2.start()
        await set_admin_claim(t2, str(admin_id))
        t2_pid = await t2.fetchval("SELECT pg_backend_pid()")
        t2_task = asyncio.create_task(
            t2.fetchval(
                "SELECT public.admin_regenerate_establishment_no($1)", co_id
            )
        )

        # Poll pg_stat_activity until T2 is waiting on a lock held by T1,
        # or fail after a bounded wait. This is the proof that a lock exists.
        blocked = False
        blocker_pids: list[int] = []
        wait_event = ""
        for _ in range(50):  # ~5s max
            await asyncio.sleep(0.1)
            if t2_task.done():
                break  # T2 completed without blocking -> failure below
            row = await observer.fetchrow(
                """
                SELECT wait_event_type, wait_event,
                       pg_blocking_pids(pid) AS blockers
                  FROM pg_stat_activity WHERE pid = $1
                """,
                t2_pid,
            )
            if row and row["wait_event_type"] == "Lock":
                blocked = True
                blocker_pids = list(row["blockers"] or [])
                wait_event = row["wait_event"] or ""
                break

        record(
            blocked,
            "T2 blocks on a transaction lock while T1 holds the row",
            f"t2_done_early={t2_task.done()}",
        )
        record(
            t1_pid in blocker_pids,
            "T1 is the identified blocker of T2",
            f"blockers={blocker_pids} t1_pid={t1_pid} wait_event={wait_event}",
        )

        # Commit T1 -> T2 must unblock and complete.
        await tx1.commit()
        t2_est = await asyncio.wait_for(t2_task, timeout=5.0)
        await tx2.commit()

        record(t1_est != t2_est, "T1 and T2 returned distinct est_nos",
               f"t1={t1_est} t2={t2_est}")

        fmt = re.compile(r"^HBS-[0-9]{6,}$")
        record(bool(fmt.match(t1_est) and fmt.match(t2_est)),
               "both returned values match HBS-######",
               f"t1={t1_est} t2={t2_est}")

        final = await observer.fetchval(
            "SELECT establishment_no FROM public.companies WHERE id=$1", co_id
        )
        record(final == t2_est,
               "final row equals last committer's value (T2 wins)",
               f"final={final} t2={t2_est}")

        entries = await observer.fetch(
            """
            SELECT diff->>'new_establishment_no' AS new_no, created_at
              FROM public.audit_log
             WHERE entity='companies' AND entity_id=$1
               AND action='regenerate_establishment_no'
             ORDER BY created_at
            """,
            co_id,
        )
        record(len(entries) == 2,
               "audit_log recorded exactly 2 regeneration entries",
               f"count={len(entries)}")
        if len(entries) == 2:
            record(
                entries[0]["new_no"] == t1_est and entries[1]["new_no"] == t2_est,
                "audit_log entries are ordered T1 then T2 (commit order)",
                f"entries={[e['new_no'] for e in entries]}",
            )

        # No other live company shares either value.
        collisions = await observer.fetchval(
            """
            SELECT count(*) FROM public.companies
             WHERE id <> $1 AND deleted_at IS NULL
               AND upper(establishment_no) IN (upper($2), upper($3))
            """,
            co_id, t1_est, t2_est,
        )
        record(collisions == 0,
               "neither est_no collides with any other live company",
               f"collisions={collisions}")

    finally:
        # Cleanup: soft-delete the fixture company + audit rows using admin
        # SECURITY DEFINER paths where available; fall back to direct writes
        # under the postgres superuser role that this sandbox connects as.
        try:
            async with setup.transaction():
                await setup.execute(
                    "DELETE FROM public.audit_log WHERE entity='companies' AND entity_id=$1",
                    co_id,
                )
                await setup.execute("DELETE FROM public.companies WHERE id=$1", co_id)
                await setup.execute("DELETE FROM public.organizations WHERE id=$1", org_id)
        except Exception as e:
            msgs.append(f"note — cleanup skipped ({e!s})")
        for c in (t1, t2, observer, setup):
            await c.close()

    for m in msgs:
        print(m)
    print(f"summary — {ok}/{ok+bad} passed")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))