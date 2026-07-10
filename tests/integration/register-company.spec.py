"""
Integration test for public.register_company(_name, _phone).

This test runs against the sandbox database via psql (PG* env vars) using
the read-only `sandbox_exec` role, so it cannot perform destructive writes
to set up a "clean" user. Instead it validates:

  1. `authenticated` has EXECUTE on register_company — the exact grant
     that was missing and produced the "permission denied for function
     register_company" toast on the onboarding wizard.
  2. Anonymous (no JWT claim) → "Not authenticated".
  3. Invalid name (< 2 chars) → "Invalid company name" (checked BEFORE the
     membership guard in the function, so works for any signed-in caller).
  4. A user who already owns/admins an org → "You already belong to a
     company" (uses an existing owner from public.organization_members).
  5. The function definition still wires the expected data writes:
     INSERT INTO organizations, INSERT INTO organization_members with
     role='owner', and UPDATE profiles with approval_status='approved'.
     This is the structural check that the happy-path writes are still in
     place without requiring us to actually insert-then-rollback.

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
  END;

-- Pick an existing owner for the "already belongs" case, and any profile
-- for the invalid-name case (validated before the membership check).
DO $$
DECLARE u_owner uuid; u_any uuid;
BEGIN
  SELECT user_id INTO u_owner FROM public.organization_members
    WHERE role IN ('owner','admin') LIMIT 1;
  SELECT id INTO u_any FROM public.profiles LIMIT 1;
  IF u_owner IS NULL OR u_any IS NULL THEN
    RAISE EXCEPTION 'Fixture requires >=1 owner membership and >=1 profile';
  END IF;
  PERFORM set_config('test.u_owner', u_owner::text, false);
  PERFORM set_config('test.u_any',   u_any::text,   false);
END $$;

-- 2) Anonymous rejected

SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
DO $$
BEGIN
  PERFORM public.register_company('Anon Co', NULL);
  RAISE NOTICE 'FAIL: anon call unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Not authenticated%' OR SQLERRM LIKE '%permission denied%' THEN
    RAISE NOTICE 'PASS: anon rejected (%)', SQLERRM;
  ELSE
    RAISE NOTICE 'FAIL: wrong error for anon: %', SQLERRM;
  END IF;
END $$;


-- 3) Invalid name rejected (validated before membership check)

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.u_any'), 'role','authenticated')::text, true);
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


-- 4) Duplicate registration rejected

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.u_owner'), 'role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.register_company('Second Co', NULL);
  RAISE NOTICE 'FAIL: duplicate call unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%already belong%' THEN
    RAISE NOTICE 'PASS: duplicate registration rejected (%)', SQLERRM;
  ELSE
    RAISE NOTICE 'FAIL: wrong error on duplicate: %', SQLERRM;
  END IF;
END $$;


-- 5) Structural check: the function still wires the expected writes.
WITH src AS (
  SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='register_company'
)
SELECT unnest(ARRAY[
  CASE WHEN def ~* 'INSERT\s+INTO\s+public\.organizations'
       THEN 'PASS: function inserts into organizations'
       ELSE 'FAIL: function no longer inserts into organizations' END,
  CASE WHEN def ~* 'INSERT\s+INTO\s+public\.organization_members'
        AND def ~* '''owner'''
       THEN 'PASS: function inserts owner into organization_members'
       ELSE 'FAIL: function no longer inserts owner membership' END,
  CASE WHEN def ~* 'UPDATE\s+public\.profiles'
        AND def ~* 'approval_status'
        AND def ~* '''approved'''
       THEN 'PASS: function updates profiles.approval_status to approved'
       ELSE 'FAIL: function no longer approves profile' END,
  CASE WHEN def ~* 'trial_ends_at'
       THEN 'PASS: function sets trial_ends_at'
       ELSE 'FAIL: function no longer sets trial_ends_at' END
]) FROM src;

-- 6) Linkage check — after register_company runs, the caller's identity must
-- resolve to the new org via get_my_company_id() and their role via
-- get_my_role(). We stand in as the existing owner (u_owner, whose membership
-- was created previously by the real register_company flow) and assert both
-- resolvers return the expected values. This is what the app depends on to
-- know "which company am I in?" and "what can I do?".
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.u_owner'), 'role','authenticated')::text, true);

SELECT CASE
  WHEN public.get_my_company_id() = (
    SELECT org_id FROM public.organization_members
      WHERE user_id = current_setting('test.u_owner')::uuid
        AND role IN ('owner','admin')
      ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
      LIMIT 1)
  THEN 'PASS: get_my_company_id resolves to the caller''s org'
  ELSE 'FAIL: get_my_company_id does not resolve to owner''s org'
END;

SELECT CASE
  WHEN public.get_my_role() IN ('company_owner','super_admin')
  THEN 'PASS: get_my_role returns company_owner (or super_admin) for the caller'
  ELSE 'FAIL: get_my_role returned ' || COALESCE(public.get_my_role(),'null')
END;

-- Extra: the organization_members row for that owner must reference an
-- organization that actually exists — catches a broken FK / dangling link.
SELECT CASE WHEN EXISTS (
  SELECT 1
    FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.org_id
   WHERE m.user_id = current_setting('test.u_owner')::uuid
     AND m.role = 'owner'
) THEN 'PASS: owner membership links to an existing organization'
  ELSE 'FAIL: owner membership has no matching organization row'
END;

ROLLBACK;
"""


def main() -> int:
    r = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=0", "-X", "-A", "-t", "-c", SQL],
        capture_output=True, text=True,
    )
    out = (r.stdout or "") + (r.stderr or "")
    print(out)
    lines = [ln for ln in out.splitlines() if "PASS:" in ln or "FAIL:" in ln]
    passed = sum(1 for ln in lines if "PASS:" in ln)
    failed = sum(1 for ln in lines if "FAIL:" in ln)
    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 and passed >= 11 else 1


if __name__ == "__main__":
    sys.exit(main())
