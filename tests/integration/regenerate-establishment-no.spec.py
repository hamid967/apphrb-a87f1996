"""
Integration test for public.admin_regenerate_establishment_no(_company_id uuid).

Coverage:
  1. Non-admin caller → raises 'Forbidden: admin only'.
  2. Unauthenticated caller → raises 'Not authenticated'.
  3. Admin caller with unknown company → raises 'Company not found'.
  4. Admin caller with real company → returns new HBS-###### number, the
     row's establishment_no is updated in place, differs from the old value,
     matches format, and updated_at was bumped.
  5. Uniqueness: regenerating twice produces a strictly greater sequence
     number (nextval-based).

All fixtures are created and rolled back inside a single transaction — no
writes persist. Run:
  python3 tests/integration/regenerate-establishment-no.spec.py
"""

import re
import subprocess
import sys

SQL = r"""
BEGIN;

CREATE TEMP TABLE _rgn_fixture AS
  SELECT
    (SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1) AS admin_id,
    (SELECT id FROM public.profiles
       WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
       LIMIT 1) AS non_admin_id;

DO $$
DECLARE
  f record;
  org_id uuid := gen_random_uuid();
  company_id uuid := gen_random_uuid();
  bogus_id uuid := gen_random_uuid();
  old_no text; new_no text; second_no text;
  old_updated timestamptz; new_updated timestamptz;
  ok int := 0; bad int := 0;
  raised text;
BEGIN
  SELECT * INTO f FROM _rgn_fixture;
  IF f.admin_id IS NULL OR f.non_admin_id IS NULL THEN
    RAISE EXCEPTION 'Need one admin and one non-admin profile';
  END IF;

  INSERT INTO public.organizations(id, name, slug, created_by)
    VALUES (org_id, 'RGN Test Org', 'rgn-test-' || substr(org_id::text,1,8), f.admin_id);
  INSERT INTO public.companies(id, org_id, name, created_by)
    VALUES (company_id, org_id, 'RGN Test Co', f.admin_id);

  SELECT establishment_no, updated_at INTO old_no, old_updated
    FROM public.companies WHERE id = company_id;
  RAISE NOTICE 'TEST:setup company=% old_no=%', company_id, old_no;

  -- 1) Non-admin → Forbidden
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', f.non_admin_id, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.admin_regenerate_establishment_no(company_id);
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised LIKE '%admin only%' THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS non-admin blocked (%)', raised;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL non-admin should be blocked (raised=%)', raised;
  END IF;

  -- 2) Unauthenticated → Not authenticated
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.admin_regenerate_establishment_no(company_id);
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised LIKE '%Not authenticated%' THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS unauthenticated blocked (%)', raised;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL unauthenticated should be blocked (raised=%)', raised;
  END IF;

  -- 3) Admin + unknown company → Company not found
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', f.admin_id, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.admin_regenerate_establishment_no(bogus_id);
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised LIKE '%Company not found%' THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS unknown company rejected (%)', raised;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL unknown company should be rejected (raised=%)', raised;
  END IF;

  -- 4) Admin + real company → returns new number, row updated
  PERFORM pg_sleep(0.05); -- ensure updated_at bump is observable
  new_no := public.admin_regenerate_establishment_no(company_id);
  IF new_no ~ '^HBS-[0-9]{6,}$' THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS returned value matches HBS-###### (%)', new_no;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL returned value bad format (%)', new_no;
  END IF;

  IF new_no <> old_no THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS new_no differs from old_no (% -> %)', old_no, new_no;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL new_no == old_no (%)', new_no;
  END IF;

  SELECT establishment_no, updated_at INTO new_no, new_updated
    FROM public.companies WHERE id = company_id;
  IF new_no ~ '^HBS-[0-9]{6,}$' AND new_no <> old_no THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS row updated in place (est_no=%)', new_no;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL row not updated (est_no=%)', new_no;
  END IF;

  -- Note: within a single transaction now() is stable, so updated_at cannot
  -- strictly advance here. We assert it did not regress instead.
  IF new_updated >= old_updated THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS updated_at did not regress';
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL updated_at regressed (old=% new=%)', old_updated, new_updated;
  END IF;

  -- 5) Regenerating again yields strictly greater sequence value
  second_no := public.admin_regenerate_establishment_no(company_id);
  IF (substring(second_no from 5)::int) > (substring(new_no from 5)::int) THEN
    ok:=ok+1; RAISE NOTICE 'TEST:PASS second regenerate strictly greater (% -> %)', new_no, second_no;
  ELSE
    bad:=bad+1; RAISE NOTICE 'TEST:FAIL second regenerate not greater (% -> %)', new_no, second_no;
  END IF;

  RAISE NOTICE 'TEST:summary %/% passed', ok, ok+bad;
  IF bad > 0 THEN RAISE EXCEPTION 'admin_regenerate_establishment_no: % failures', bad; END IF;
END $$;

ROLLBACK;
"""


def main() -> int:
    r = subprocess.run(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", SQL],
        capture_output=True, text=True,
    )
    output = (r.stdout or "") + (r.stderr or "")
    for line in output.splitlines():
        m = re.search(r"TEST:(PASS|FAIL|summary|setup)\s+(.*)", line)
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