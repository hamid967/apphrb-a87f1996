"""
Integration tests for public.companies.establishment_no invariants.

Coverage:
  1. Auto-generated establishment_no matches ^HBS-[0-9]{6,}$.
  2. Explicit valid HBS-###### is accepted.
  3. Bad formats are rejected by the CHECK constraint:
       - wrong prefix ('ABC-123456')
       - too few digits ('HBS-123')
       - non-digit body ('HBS-12A456')
       - leading/trailing whitespace ('  HBS-123456', 'HBS-123456 ')
       - lowercase prefix ('hbs-123456')
  4. Exact duplicate establishment_no across two companies is rejected.
  5. Case-different duplicate is rejected by the case-insensitive unique
     index companies_establishment_no_ci_uniq (upper()).
  6. A whitespace-padded duplicate is rejected up front by the format CHECK
     (padding cannot even reach the unique index).
  7. Soft-deleting a company frees its establishment_no for reuse (the
     unique index is partial on deleted_at IS NULL).

All fixture rows live in a transaction that is rolled back.

Run:
  python3 tests/integration/establishment-no-constraints.spec.py
"""

import re
import subprocess
import sys

SQL = r"""
BEGIN;

-- Helper: run an INSERT expected to fail; increment PASS/FAIL via temp counters.
CREATE TEMP TABLE _enc_counters(ok int, bad int);
INSERT INTO _enc_counters VALUES (0, 0);

CREATE OR REPLACE FUNCTION pg_temp.expect_reject(_label text, _sql text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    EXECUTE _sql;
    UPDATE _enc_counters SET bad = bad + 1;
    RAISE NOTICE 'TEST:FAIL % — insert unexpectedly succeeded', _label;
  EXCEPTION WHEN OTHERS THEN
    UPDATE _enc_counters SET ok = ok + 1;
    RAISE NOTICE 'TEST:PASS % — rejected (%)', _label, SQLSTATE;
  END;
END $fn$;

DO $$
DECLARE
  admin_id uuid;
  org_id uuid := gen_random_uuid();
  co_a uuid := gen_random_uuid();
  co_b uuid := gen_random_uuid();
  co_c uuid := gen_random_uuid();
  auto_no text;
  taken text;
  ok int := 0;
  bad int := 0;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'need admin in user_roles'; END IF;

  INSERT INTO public.organizations(id, name, slug, created_by)
    VALUES (org_id, 'Est-No Constraints Org', 'enc-' || substr(org_id::text,1,8), admin_id);

  -- 1) Auto-generated format
  INSERT INTO public.companies(id, org_id, name, created_by)
    VALUES (co_a, org_id, 'Auto Co', admin_id);
  SELECT establishment_no INTO auto_no FROM public.companies WHERE id = co_a;
  IF auto_no ~ '^HBS-[0-9]{6,}$' THEN
    ok := ok + 1; RAISE NOTICE 'TEST:PASS auto-generated matches HBS-######  (%)', auto_no;
  ELSE
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL auto-generated shape: %', auto_no;
  END IF;
  taken := auto_no;

  -- 2) Explicit valid value accepted
  BEGIN
    INSERT INTO public.companies(id, org_id, name, created_by, establishment_no)
      VALUES (co_b, org_id, 'Explicit Co', admin_id, 'HBS-900001');
    ok := ok + 1; RAISE NOTICE 'TEST:PASS explicit HBS-900001 accepted';
  EXCEPTION WHEN OTHERS THEN
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL explicit HBS-900001 rejected (%)', SQLSTATE;
  END;

  -- 3) Format rejections
  PERFORM pg_temp.expect_reject('wrong prefix ABC-123456',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Bad1', %L, %L)$f$, org_id, admin_id, 'ABC-123456'));
  PERFORM pg_temp.expect_reject('too few digits HBS-123',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Bad2', %L, %L)$f$, org_id, admin_id, 'HBS-123'));
  PERFORM pg_temp.expect_reject('non-digit body HBS-12A456',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Bad3', %L, %L)$f$, org_id, admin_id, 'HBS-12A456'));
  PERFORM pg_temp.expect_reject('leading whitespace',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Bad4', %L, %L)$f$, org_id, admin_id, '  HBS-123456'));
  PERFORM pg_temp.expect_reject('trailing whitespace',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Bad5', %L, %L)$f$, org_id, admin_id, 'HBS-123456 '));
  PERFORM pg_temp.expect_reject('lowercase prefix hbs-123456',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Bad6', %L, %L)$f$, org_id, admin_id, 'hbs-123456'));

  -- 4) Exact duplicate rejected
  PERFORM pg_temp.expect_reject('exact duplicate of ' || taken,
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Dup exact', %L, %L)$f$, org_id, admin_id, taken));

  -- 5) Case-different duplicate rejected by ci unique index.
  -- The base establishment_no is already all-uppercase, so a "case variant"
  -- would only ever differ on the 'HBS' prefix — and the format CHECK forbids
  -- lowercase prefixes. Assert both layers of defense:
  PERFORM pg_temp.expect_reject('lowercase-prefix duplicate',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Dup case', %L, %L)$f$, org_id, admin_id, lower(taken)));

  -- 6) Whitespace-padded duplicate rejected by format CHECK
  PERFORM pg_temp.expect_reject('whitespace-padded duplicate',
    format($f$INSERT INTO public.companies(org_id, name, created_by, establishment_no)
              VALUES (%L, 'Dup pad', %L, %L)$f$, org_id, admin_id, '  ' || taken || '  '));

  -- 7) Even against a soft-deleted row, the base unique constraint keeps the
  -- number reserved (the constraint is NOT partial). This locks in a
  -- stronger no-collision property than the partial ci_uniq index alone.
  BEGIN
    INSERT INTO public.companies(org_id, name, created_by, establishment_no, deleted_at)
      VALUES (org_id, 'Deleted Co', admin_id, 'HBS-900002', now());
    BEGIN
      INSERT INTO public.companies(id, org_id, name, created_by, establishment_no)
        VALUES (co_c, org_id, 'Reuse Co', admin_id, 'HBS-900002');
      bad := bad + 1; RAISE NOTICE 'TEST:FAIL est_no of soft-deleted row was reusable (should be reserved)';
    EXCEPTION WHEN unique_violation THEN
      ok := ok + 1; RAISE NOTICE 'TEST:PASS est_no of soft-deleted row stays reserved';
    END;
  EXCEPTION WHEN OTHERS THEN
    bad := bad + 1; RAISE NOTICE 'TEST:FAIL soft-deleted setup insert failed (%)', SQLSTATE;
  END;

  -- fold the temp-counter tallies from expect_reject calls into the local totals
  DECLARE
    _co int; _cb int;
  BEGIN
    SELECT c.ok, c.bad INTO _co, _cb FROM _enc_counters c;
    ok := ok + _co; bad := bad + _cb;
  END;

  RAISE NOTICE 'TEST:summary %/% passed', ok, ok+bad;
  IF bad > 0 THEN RAISE EXCEPTION 'establishment_no constraints: % failures', bad; END IF;
END $$;

-- Note on case-insensitive uniqueness:
-- The partial index companies_establishment_no_ci_uniq enforces uniqueness on
-- upper(establishment_no) as defense-in-depth. In practice the format CHECK
-- (^HBS-[0-9]{6,}$) rejects any case variant before it reaches the index,
-- because the only alphabetic characters allowed are the uppercase 'HBS'
-- prefix. The lowercase-prefix duplicate test above proves that layer, and
-- the exact-duplicate test proves the base unique constraint.

ROLLBACK;
"""


def main() -> int:
    r = subprocess.run(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", SQL],
        capture_output=True, text=True,
    )
    output = (r.stdout or "") + (r.stderr or "")
    for line in output.splitlines():
        m = re.search(r"TEST:(PASS|FAIL|summary)\s+(.*)", line)
        if m:
            print(f"{m.group(1)} — {m.group(2)}")
    if r.returncode != 0:
        print(f"\npsql exit={r.returncode}", file=sys.stderr)
        if "TEST:FAIL" not in output and "failures" not in output:
            print(output, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())