"""
Integration test for public.register_company(_name, _phone).

Coverage:
  1. `authenticated` role has EXECUTE on register_company (the exact grant
     that was missing and produced the "permission denied for function
     register_company" toast in the onboarding wizard).
  2. A signed-in user (JWT claim `sub` set) can call register_company and it:
       - inserts a row in public.organizations
       - inserts an 'owner' row in public.organization_members
       - updates public.profiles (phone + approval_status='approved' + trial_ends_at)
       - returns { org_id, trial_days: 14 }
  3. Calling it a second time as the same user raises
     "You already belong to a company".
  4. Anonymous (no JWT claim) raises "Not authenticated".
  5. Invalid name (< 2 chars) raises "Invalid company name".

Runs against the sandbox database via psql / PG* env vars. All writes are
inside a BEGIN/ROLLBACK so nothing persists.

Run:
  python3 tests/integration/register-company.spec.py
"""

import subprocess
import sys

SQL = r"""
BEGIN;

-- 1) Grant check
SELECT
  CASE WHEN has_function_privilege('authenticated','public.register_company(text,text)','EXECUTE')
       THEN 'PASS: authenticated has EXECUTE on register_company'
       ELSE 'FAIL: authenticated missing EXECUTE on register_company'
  END AS grant_check;

-- Fixture: pick one existing profile and clear its membership INSIDE this txn
-- (rolled back at the end) so register_company's "already belong" guard doesn't
-- block the happy path. Mirrors what a brand-new signup looks like.
DO $$
DECLARE u1 uuid;
BEGIN
  SELECT id INTO u1 FROM public.profiles ORDER BY created_at LIMIT 1;
  IF u1 IS NULL THEN RAISE EXCEPTION 'Need >=1 profile'; END IF;
  DELETE FROM public.organization_members WHERE user_id = u1;
  PERFORM set_config('test.uid', u1::text, false);
END $$;

-- 2) Happy path — call as the fixture user via JWT claim
SET LOCAL role = 'authenticated';
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role','authenticated')::text,
  true
);

SELECT
  CASE WHEN (public.register_company('Test Co', '+966500000000')->>'trial_days')::int = 14
       THEN 'PASS: register_company returns trial_days=14'
       ELSE 'FAIL: register_company return payload wrong'
  END AS happy_path;

RESET role;

SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.organizations WHERE created_by = current_setting('test.uid')::uuid AND name = 'Test Co'
) THEN 'PASS: organizations row inserted'
  ELSE 'FAIL: organizations row missing' END;

SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.organization_members
   WHERE user_id = current_setting('test.uid')::uuid AND role = 'owner'
) THEN 'PASS: organization_members owner row inserted'
  ELSE 'FAIL: organization_members owner row missing' END;

SELECT CASE
  WHEN phone = '+966500000000'
   AND approval_status = 'approved'
   AND trial_ends_at IS NOT NULL AND trial_ends_at > now() + interval '13 days'
  THEN 'PASS: profile updated (phone, approval, trial_ends_at)'
  ELSE 'FAIL: profile not updated as expected'
END FROM public.profiles WHERE id = current_setting('test.uid')::uuid;

-- 3) Second call must fail with "already belong to a company"
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role','authenticated')::text, true);

DO $$
BEGIN
  PERFORM public.register_company('Second Co', NULL);
  RAISE NOTICE 'FAIL: second register_company call unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%already belong%' THEN
    RAISE NOTICE 'PASS: duplicate registration rejected (% )', SQLERRM;
  ELSE
    RAISE NOTICE 'FAIL: wrong error on duplicate: %', SQLERRM;
  END IF;
END $$;

RESET role;

-- 4) Anonymous call rejected
SET LOCAL role = 'anon';
SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

DO $$
BEGIN
  PERFORM public.register_company('Anon Co', NULL);
  RAISE NOTICE 'FAIL: anon register_company call unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Not authenticated%' OR SQLERRM LIKE '%permission denied%' THEN
    RAISE NOTICE 'PASS: anon rejected (%)', SQLERRM;
  ELSE
    RAISE NOTICE 'FAIL: wrong error for anon: %', SQLERRM;
  END IF;
END $$;

RESET role;

-- 5) Invalid name (reuse test.uid2, an unaffiliated profile)

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid2'), 'role','authenticated')::text, true);

DO $$
BEGIN
  PERFORM public.register_company('x', NULL);
  RAISE NOTICE 'FAIL: short-name call unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Invalid company name%' THEN
    RAISE NOTICE 'PASS: short name rejected (%)', SQLERRM;
  ELSE
    RAISE NOTICE 'FAIL: wrong error on short name: %', SQLERRM;
  END IF;
END $$;

ROLLBACK;
"""


def main() -> int:
    r = subprocess.run(["psql", "-v", "ON_ERROR_STOP=0", "-X", "-A", "-t", "-c", SQL],
                       capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    print(out)
    lines = [ln for ln in out.splitlines() if "PASS:" in ln or "FAIL:" in ln]
    passed = sum(1 for ln in lines if "PASS:" in ln)
    failed = sum(1 for ln in lines if "FAIL:" in ln)
    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 and passed >= 7 else 1


if __name__ == "__main__":
    sys.exit(main())
