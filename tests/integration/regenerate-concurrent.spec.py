"""
Integration test: concurrent regeneration of establishment_no must never
produce duplicates.

Two layers are exercised — together they cover the concurrency contract of
admin_regenerate_establishment_no:

  A. **True concurrent atomic ID allocation** — the load-bearing primitive
     is nextval('public.hbs_establishment_no_seq'). The regenerate function
     builds the new value as
         'HBS-' || lpad(nextval('public.hbs_establishment_no_seq')::text, 6, '0')
     so two simultaneous regenerations can only collide if two simultaneous
     nextval() calls return the same integer. This test spawns N parallel
     psql connections that each call nextval and asserts every returned
     value is distinct.

  B. **End-to-end burst regeneration** — inside one transaction, create a
     test company, then invoke admin_regenerate_establishment_no in a tight
     burst (via generate_series) and assert every returned value is:
       - unique across the burst,
       - format-valid (^HBS-[0-9]{6,}$),
       - distinct from every other live company's establishment_no.
     The row lands in a transaction that is rolled back at the end, so no
     fixture persists.

Run:
  python3 tests/integration/regenerate-concurrent.spec.py
"""

import concurrent.futures
import re
import subprocess
import sys

N_PARALLEL = 24
N_BURST = 50


def call_nextval() -> int:
    r = subprocess.run(
        ["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1",
         "-c", "SELECT nextval('public.hbs_establishment_no_seq')"],
        capture_output=True, text=True, check=True,
    )
    return int(r.stdout.strip())


def test_parallel_nextval() -> tuple[int, int, list[str]]:
    ok = bad = 0
    msgs: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=N_PARALLEL) as ex:
        values = list(ex.map(lambda _: call_nextval(), range(N_PARALLEL)))
    if len(set(values)) == N_PARALLEL:
        ok += 1
        msgs.append(f"PASS — {N_PARALLEL} parallel nextval() calls all distinct")
    else:
        bad += 1
        dup = [v for v in set(values) if values.count(v) > 1]
        msgs.append(f"FAIL — parallel nextval() returned duplicates: {dup}")
    return ok, bad, msgs


BURST_SQL = f"""
BEGIN;

DO $$
DECLARE
  admin_id uuid;
  org_id uuid := gen_random_uuid();
  co_id uuid := gen_random_uuid();
  ok int := 0;
  bad int := 0;
  total_returned int;
  distinct_returned int;
  malformed int;
  collisions int;
  final_no text;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'need admin in user_roles'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role','authenticated')::text, true);

  INSERT INTO public.organizations(id, name, slug, created_by)
    VALUES (org_id, 'Regen Concurrency Org', 'rco-' || substr(org_id::text,1,8), admin_id);
  INSERT INTO public.companies(id, org_id, name, created_by)
    VALUES (co_id, org_id, 'Regen Concurrency Co', admin_id);

  -- Burst: {N_BURST} back-to-back regenerations against the SAME company.
  -- Each call goes through the full SECURITY DEFINER path (admin check,
  -- nextval, UPDATE, audit_log INSERT). Collect every returned value.
  CREATE TEMP TABLE _burst(seq int PRIMARY KEY, est_no text NOT NULL);
  INSERT INTO _burst(seq, est_no)
    SELECT g, public.admin_regenerate_establishment_no(co_id)
      FROM generate_series(1, {N_BURST}) g;

  SELECT count(*), count(DISTINCT est_no),
         count(*) FILTER (WHERE est_no !~ '^HBS-[0-9]{{6,}}$')
    INTO total_returned, distinct_returned, malformed FROM _burst;

  IF total_returned = {N_BURST} AND distinct_returned = {N_BURST} THEN
    ok := ok + 1; RAISE NOTICE 'TEST:PASS burst of {N_BURST} regen calls returned {N_BURST} distinct values';
  ELSE
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL burst uniqueness: total=% distinct=%', total_returned, distinct_returned;
  END IF;

  IF malformed = 0 THEN
    ok := ok + 1; RAISE NOTICE 'TEST:PASS every burst value matches HBS-######';
  ELSE
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL % burst values malformed', malformed;
  END IF;

  -- None of the burst values may collide with any OTHER live company.
  SELECT count(*) INTO collisions
    FROM _burst b
    JOIN public.companies c
      ON upper(c.establishment_no) = upper(b.est_no)
     AND c.id <> co_id
     AND c.deleted_at IS NULL;
  IF collisions = 0 THEN
    ok := ok + 1; RAISE NOTICE 'TEST:PASS no burst value collides with any other live company';
  ELSE
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL % burst values collide with existing companies', collisions;
  END IF;

  -- Final DB state: the company's current establishment_no must be the last
  -- value returned by the burst, and every intermediate value is unique.
  SELECT establishment_no INTO final_no FROM public.companies WHERE id = co_id;
  IF final_no = (SELECT est_no FROM _burst WHERE seq = {N_BURST}) THEN
    ok := ok + 1; RAISE NOTICE 'TEST:PASS final establishment_no matches last burst value (%)', final_no;
  ELSE
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL final establishment_no % != last burst value', final_no;
  END IF;

  -- Every regen must have written an audit_log entry for this company.
  IF (SELECT count(*) FROM public.audit_log
        WHERE entity='companies' AND entity_id=co_id
          AND action='regenerate_establishment_no') = {N_BURST} THEN
    ok := ok + 1; RAISE NOTICE 'TEST:PASS audit_log recorded {N_BURST} regeneration entries';
  ELSE
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL audit_log entry count mismatch';
  END IF;

  RAISE NOTICE 'TEST:summary %/% passed', ok, ok+bad;
  IF bad > 0 THEN RAISE EXCEPTION 'regen concurrency (burst): % failures', bad; END IF;
END $$;

ROLLBACK;
"""


def run_burst() -> tuple[int, int, list[str]]:
    r = subprocess.run(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", BURST_SQL],
        capture_output=True, text=True,
    )
    output = (r.stdout or "") + (r.stderr or "")
    msgs: list[str] = []
    ok = bad = 0
    for line in output.splitlines():
        m = re.search(r"TEST:(PASS|FAIL|summary)\s+(.*)", line)
        if m:
            tag, msg = m.group(1), m.group(2)
            msgs.append(f"{tag} — {msg}")
            if tag == "PASS": ok += 1
            elif tag == "FAIL": bad += 1
    if r.returncode != 0 and not any("FAIL" in m for m in msgs):
        msgs.append(f"FAIL — psql exit={r.returncode}: {output[-400:]}")
        bad += 1
    return ok, bad, msgs


def main() -> int:
    total_ok = total_bad = 0
    a_ok, a_bad, a_msgs = test_parallel_nextval()
    for m in a_msgs: print(m)
    total_ok += a_ok; total_bad += a_bad

    b_ok, b_bad, b_msgs = run_burst()
    for m in b_msgs: print(m)
    total_ok += b_ok; total_bad += b_bad

    print(f"summary — {total_ok}/{total_ok + total_bad} passed")
    return 0 if total_bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())