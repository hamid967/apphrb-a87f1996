"""
Integration test for the full sign-in flow gate.

The client flow in src/routes/auth.tsx is:
  1. supabase.auth.signInWithPassword(email, password)   -- credentials check
  2. supabase.rpc('verify_my_establishment', { _est_no }) -- company gate
  3. if !ok  -> supabase.auth.signOut() and reject
     if  ok  -> session stays open, user is routed to the app.

Step (1) is Supabase Auth (email + password) and cannot be exercised from
psql; step (2) is the SQL predicate that decides whether a *credentialed*
user actually gets a live session for a given establishment number.
That predicate is the entire multi-tenant boundary of the login flow, so
this suite drives it end-to-end with the same identities the real login
would use:

   - user of company A + est_no of company A  -> session opens
   - user of company A + est_no of company B  -> session refused
   - user of company B + est_no of company A  -> session refused
   - non-member       + any real est_no       -> session refused
   - super admin      + any/empty est_no      -> session opens (bypass)
   - case / whitespace variants of a matching est_no -> session opens
   - soft-deleted company's est_no            -> session refused
   - unknown est_no                           -> session refused
   - unauthenticated (no jwt.sub)             -> session refused

All fixture rows are inserted inside a transaction and rolled back.

Run:
  python3 tests/integration/login-flow.spec.py
"""

import re
import subprocess
import sys

SQL = r"""
BEGIN;

DO $$
DECLARE
  admin_id uuid;
  user_a uuid;
  user_b uuid;
  outsider uuid;
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  co_a uuid := gen_random_uuid();
  co_b uuid := gen_random_uuid();
  co_deleted uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'need an admin in user_roles'; END IF;

  SELECT id INTO user_a FROM public.profiles
    WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
    LIMIT 1;
  SELECT id INTO user_b FROM public.profiles
    WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
      AND id <> user_a
    LIMIT 1;
  SELECT id INTO outsider FROM public.profiles
    WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
      AND id NOT IN (user_a, user_b)
    LIMIT 1;
  IF user_a IS NULL OR user_b IS NULL OR outsider IS NULL THEN
    RAISE EXCEPTION 'need >=3 non-admin profiles for cross-tenant coverage';
  END IF;

  INSERT INTO public.organizations(id, name, slug, created_by) VALUES
    (org_a, 'Login Flow Org A', 'lf-a-' || substr(org_a::text,1,8), admin_id),
    (org_b, 'Login Flow Org B', 'lf-b-' || substr(org_b::text,1,8), admin_id);

  INSERT INTO public.companies(id, org_id, name, created_by) VALUES
    (co_a, org_a, 'Login Flow Co A', admin_id),
    (co_b, org_b, 'Login Flow Co B', admin_id);
  INSERT INTO public.companies(id, org_id, name, created_by, deleted_at) VALUES
    (co_deleted, org_a, 'Login Flow Co Deleted', admin_id, now());

  INSERT INTO public.organization_members(org_id, user_id, role) VALUES
    (org_a, user_a, 'agent'),
    (org_b, user_b, 'agent')
  ON CONFLICT DO NOTHING;
END $$;

CREATE TEMP TABLE _lf AS
  SELECT
    (SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1) AS admin_id,
    ma.user_id AS user_a,
    mb.user_id AS user_b,
    (SELECT id FROM public.profiles
       WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role='admin')
         AND id NOT IN (ma.user_id, mb.user_id)
       LIMIT 1) AS outsider,
    ca.establishment_no AS est_a,
    cb.establishment_no AS est_b,
    cd.establishment_no AS est_deleted
  FROM public.organizations oa
  JOIN public.organizations ob ON ob.name = 'Login Flow Org B'
  JOIN public.companies ca ON ca.org_id = oa.id AND ca.deleted_at IS NULL
  JOIN public.companies cb ON cb.org_id = ob.id AND cb.deleted_at IS NULL
  JOIN public.companies cd ON cd.org_id = oa.id AND cd.deleted_at IS NOT NULL
  JOIN public.organization_members ma ON ma.org_id = oa.id AND ma.role = 'agent'
  JOIN public.organization_members mb ON mb.org_id = ob.id AND mb.role = 'agent'
  WHERE oa.name = 'Login Flow Org A'
  LIMIT 1;

DO $$
DECLARE
  f record;
  session_open boolean;
  ok int := 0;
  bad int := 0;

  -- Mirrors the client gate: after a successful signInWithPassword the
  -- session survives iff verify_my_establishment(_est_no) returns true.
  FUNCTION dummy() RETURNS void AS $inner$ BEGIN RETURN; END $inner$ LANGUAGE plpgsql;
BEGIN
  SELECT * INTO f FROM _lf;
  RAISE NOTICE 'TEST:setup user_a=% user_b=% est_a=% est_b=%',
    f.user_a, f.user_b, f.est_a, f.est_b;

  -- 1) user_a + est_a  -> session opens
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.user_a, 'role','authenticated')::text, true);
  session_open := public.verify_my_establishment(f.est_a);
  IF session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of A opens session for est_a';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of A opens session for est_a'; END IF;

  -- 2) user_a + est_b  -> session refused (cross-tenant)
  session_open := public.verify_my_establishment(f.est_b);
  IF NOT session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of A refused for est_b (cross-tenant)';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of A refused for est_b (cross-tenant)'; END IF;

  -- 3) user_a + case/whitespace variant of est_a  -> session opens
  session_open := public.verify_my_establishment('  ' || lower(f.est_a) || '  ');
  IF session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of A opens session for normalized est_a';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of A opens session for normalized est_a'; END IF;

  -- 4) user_a + soft-deleted est_no  -> session refused
  session_open := public.verify_my_establishment(f.est_deleted);
  IF NOT session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of A refused for soft-deleted est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of A refused for soft-deleted est_no'; END IF;

  -- 5) user_a + unknown est_no  -> session refused
  session_open := public.verify_my_establishment('HBS-000000');
  IF NOT session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of A refused for unknown est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of A refused for unknown est_no'; END IF;

  -- 6) user_b + est_a  -> session refused (opposite direction)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.user_b, 'role','authenticated')::text, true);
  session_open := public.verify_my_establishment(f.est_a);
  IF NOT session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of B refused for est_a';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of B refused for est_a'; END IF;

  -- 7) user_b + est_b  -> session opens
  session_open := public.verify_my_establishment(f.est_b);
  IF session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS member of B opens session for est_b';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL member of B opens session for est_b'; END IF;

  -- 8) outsider + est_a  -> session refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.outsider, 'role','authenticated')::text, true);
  session_open := public.verify_my_establishment(f.est_a);
  IF NOT session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS non-member refused for real est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL non-member refused for real est_no'; END IF;

  -- 9) super admin + arbitrary est_no  -> session opens (bypass)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.admin_id, 'role','authenticated')::text, true);
  session_open := public.verify_my_establishment('HBS-999999');
  IF session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS super admin opens session for arbitrary est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL super admin opens session for arbitrary est_no'; END IF;

  -- 10) super admin + empty est_no  -> session opens (bypass)
  session_open := public.verify_my_establishment('');
  IF session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS super admin opens session for empty est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL super admin opens session for empty est_no'; END IF;

  -- 11) unauthenticated (no jwt.sub)  -> session refused
  PERFORM set_config('request.jwt.claims', '', true);
  session_open := public.verify_my_establishment(f.est_a);
  IF NOT session_open THEN ok:=ok+1; RAISE NOTICE 'TEST:PASS unauthenticated refused for real est_no';
    ELSE bad:=bad+1; RAISE NOTICE 'TEST:FAIL unauthenticated refused for real est_no'; END IF;

  RAISE NOTICE 'TEST:summary %/% passed', ok, ok+bad;
  IF bad > 0 THEN RAISE EXCEPTION 'login-flow: % failures', bad; END IF;
END $$;

ROLLBACK;
"""


def main() -> int:
    # strip the inline FUNCTION helper -- Postgres DO blocks don't allow nested
    # function decls; kept out of the SQL to avoid a parse error.
    sql = re.sub(r"\n\s*--\s*Mirrors[\s\S]*?LANGUAGE plpgsql;\n", "\n", SQL)
    r = subprocess.run(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", sql],
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