"""
Integration test for public.verify_my_establishment(_est_no text).

Coverage:
  1. Super admin (has_role admin) → always returns true, regardless of est_no.
  2. Regular org member + matching establishment_no → true.
  3. Regular org member + wrong establishment_no → false.
  4. Non-member user + correct establishment_no → false.
  5. Case/whitespace insensitivity (upper + btrim) → true.
  6. Soft-deleted company is ignored → false.
  7. Unauthenticated (no JWT claim) → false.

Runs against the sandbox database via psql / PG* env vars. It uses the
existing admin user (from user_roles) and two arbitrary non-admin profile
ids as test principals. All test rows are created inside a savepoint and
rolled back at the end so nothing persists.

Run:
  python3 tests/integration/verify-my-establishment.spec.py
"""

import re
import subprocess
import sys

SQL = r"""
BEGIN;

DO $$
DECLARE
  admin_id uuid;
  member_id uuid;
  outsider_id uuid;
  org_id uuid := gen_random_uuid();
  company_id uuid := gen_random_uuid();
  deleted_company_id uuid := gen_random_uuid();
  est_no text;
  deleted_est_no text;
  passed int := 0;
  failed int := 0;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'No admin user in user_roles'; END IF;

  SELECT id INTO member_id FROM public.profiles
    WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
    LIMIT 1;
  SELECT id INTO outsider_id FROM public.profiles
    WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
      AND id <> member_id
    LIMIT 1;
  IF member_id IS NULL OR outsider_id IS NULL THEN
    RAISE EXCEPTION 'Need >=2 non-admin profiles';
  END IF;

  -- Setup
  INSERT INTO public.organizations(id, name, slug, created_by)
    VALUES (org_id, 'VME Test Org', 'vme-test-' || substr(org_id::text,1,8), admin_id);
  INSERT INTO public.companies(id, org_id, name, created_by)
    VALUES (company_id, org_id, 'VME Test Co', admin_id);
  INSERT INTO public.companies(id, org_id, name, created_by, deleted_at)
    VALUES (deleted_company_id, org_id, 'VME Deleted Co', admin_id, now());
  INSERT INTO public.organization_members(org_id, user_id, role)
    VALUES (org_id, member_id, 'agent')
    ON CONFLICT DO NOTHING;

  SELECT establishment_no INTO est_no FROM public.companies WHERE id = company_id;
  SELECT establishment_no INTO deleted_est_no FROM public.companies WHERE id = deleted_company_id;
  RAISE NOTICE 'TEST:setup est_no=% deleted_est_no=%', est_no, deleted_est_no;
END $$;

-- Run each case in its own subtxn so we can inject request.jwt.claims via SET LOCAL,
-- capture the boolean result, and print a PASS/FAIL line. We use a temp table to
-- share the fixture est_no / user ids across subtxns without cleanup grants.
CREATE TEMP TABLE _vme_fixture AS
  SELECT
    (SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1) AS admin_id,
    m.user_id AS member_id,
    (SELECT id FROM public.profiles
       WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
         AND id <> m.user_id LIMIT 1) AS outsider_id,
    c.establishment_no AS est_no,
    d.establishment_no AS deleted_est_no
  FROM public.organizations o
  JOIN public.companies c ON c.org_id = o.id AND c.deleted_at IS NULL
  JOIN public.companies d ON d.org_id = o.id AND d.deleted_at IS NOT NULL
  JOIN public.organization_members m ON m.org_id = o.id AND m.role = 'agent'
  WHERE o.name = 'VME Test Org'
  LIMIT 1;

DO $$
DECLARE f record; got boolean; ok int := 0; bad int := 0;
BEGIN
  SELECT * INTO f FROM _vme_fixture;

  -- 1) Admin: always true
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.admin_id, 'role','authenticated')::text, true);
  got := public.verify_my_establishment('HBS-999999');
  IF got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS admin returns true for arbitrary est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL admin returns true for arbitrary est_no (got %)', got; END IF;

  got := public.verify_my_establishment('');
  IF got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS admin returns true for empty est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL admin returns true for empty est_no (got %)', got; END IF;

  -- 2) Member + matching est_no
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.member_id, 'role','authenticated')::text, true);
  got := public.verify_my_establishment(f.est_no);
  IF got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member + matching est_no -> true';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member + matching est_no -> true (got %)', got; END IF;

  -- 3) Member + wrong est_no
  got := public.verify_my_establishment('HBS-000000');
  IF NOT got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member + wrong est_no -> false';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member + wrong est_no -> false (got %)', got; END IF;

  -- 4) Case/whitespace normalization
  got := public.verify_my_establishment('  ' || lower(f.est_no) || '  ');
  IF got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member + lowercase/padded est_no -> true';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member + lowercase/padded est_no -> true (got %)', got; END IF;

  -- 5) Soft-deleted company ignored
  got := public.verify_my_establishment(f.deleted_est_no);
  IF NOT got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member + soft-deleted est_no -> false';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member + soft-deleted est_no -> false (got %)', got; END IF;

  -- 6) Outsider (non-member) + correct est_no
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.outsider_id, 'role','authenticated')::text, true);
  got := public.verify_my_establishment(f.est_no);
  IF NOT got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS non-member + correct est_no -> false';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL non-member + correct est_no -> false (got %)', got; END IF;

  -- 7) Unauthenticated (no jwt claims)
  PERFORM set_config('request.jwt.claims', '', true);
  got := public.verify_my_establishment(f.est_no);
  IF NOT got THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS unauthenticated -> false';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL unauthenticated -> false (got %)', got; END IF;

  RAISE NOTICE 'TEST:summary %/% passed', ok, ok+bad;
  IF bad > 0 THEN RAISE EXCEPTION 'verify_my_establishment: % failures', bad; END IF;
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
            tag, msg = m.group(1), m.group(2)
            print(f"{tag} — {msg}")
    if r.returncode != 0:
        print(f"\npsql exit={r.returncode}", file=sys.stderr)
        if "TEST:FAIL" not in output and "failures" not in output:
            print(output, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())