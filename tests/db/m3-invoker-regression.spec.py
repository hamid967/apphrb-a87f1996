#!/usr/bin/env python3
"""
M3 regression: verify user-facing functions converted to SECURITY INVOKER
- prosecdef = false
- EXECUTE still granted to `authenticated`
- Calling as anon / unrelated user is rejected (via RLS or in-body guard)
- RLS helpers + admin fns unchanged from M1/M2 state
"""
import os, subprocess, sys, uuid

PSQL = ["psql", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"]

M3_FUNCTIONS = [
    # (name, pg_get_function_identity_arguments-format, privilege-format)
    ("tenant_pay_charge",          "_charge_id uuid, _method_id uuid",                                                              "uuid, uuid"),
    ("generate_owner_statement",   "_owner_id uuid, _month date, _mgmt_pct numeric",                                                "uuid, date, numeric"),
    ("generate_rent_charges",      "_contract_id uuid, _months integer",                                                            "uuid, integer"),
    ("approve_rental_application", "_app_id uuid, _unit_id uuid, _start_date date, _end_date date, _monthly_rent numeric",          "uuid, uuid, date, date, numeric"),
    ("submit_rental_application",  "_listing_id uuid, _applicant_name text, _email text, _phone text, _monthly_income numeric, _employer text, _move_in_date date, _credit_check_consent boolean", "uuid, text, text, text, numeric, text, date, boolean"),
    ("submit_rental_application",  "_listing_id uuid, _applicant_name text, _email text, _phone text, _monthly_income numeric, _employer text, _move_in_date date, _credit_check_consent boolean, _national_id text, _id_type text, _employment_type text, _dependents smallint, _current_rent numeric", "uuid, text, text, text, numeric, text, date, boolean, text, text, text, smallint, numeric"),
    ("next_org_sequence",          "_org uuid, _kind text",                                                                         "uuid, text"),
    ("log_assistant_access",       "_org uuid, _action text, _diff jsonb",                                                          "uuid, text, jsonb"),
    ("my_permissions",             "_org uuid",                                                                                     "uuid"),
    ("my_access_status",           "",                                                                                              ""),
]

# Must still be DEFINER (RLS helpers – converting would break RLS recursion)
STILL_DEFINER = [
    "has_role", "has_any_role", "has_permission",
    "is_org_admin", "is_org_member", "is_company_member",
    "get_my_company_id", "get_my_role",
]

passed = failed = 0

def check(cond, label):
    global passed, failed
    if cond:
        print(f"  ✓ {label}")
        passed += 1
    else:
        print(f"  ✗ {label}")
        failed += 1

def q(sql):
    r = subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

print("=== A) M3 functions are SECURITY INVOKER (prosecdef=false) ===")
for name, args in M3_FUNCTIONS:
    sql = f"""SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='{name}'
              AND pg_get_function_identity_arguments(p.oid)='{args}';"""
    out, _, _ = q(sql)
    check(out == "f", f"{name}({args}) → INVOKER")

print("\n=== B) M3 functions keep EXECUTE for `authenticated` ===")
for name, args in M3_FUNCTIONS:
    sql = f"""SELECT has_function_privilege('authenticated',
              'public.{name}({args})', 'EXECUTE');"""
    out, _, _ = q(sql)
    check(out == "t", f"{name}({args}) — authenticated=yes")

print("\n=== C) RLS helper fns remain SECURITY DEFINER ===")
for name in STILL_DEFINER:
    sql = f"""SELECT bool_and(prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='{name}';"""
    out, _, _ = q(sql)
    check(out == "t", f"{name} — still DEFINER")

print("\n=== D) INVOKER call as unrelated authenticated user is denied ===")
# my_access_status: no args, INVOKER, reads own row – should return empty/null, not crash
fake_uid = str(uuid.uuid4())
sql = f"""BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claim.sub = '{fake_uid}';
  SELECT public.my_access_status() IS NOT NULL AS ok;
ROLLBACK;"""
out, err, rc = q(sql)
check(rc == 0, "my_access_status() runs as authenticated (no crash)")

# next_org_sequence for a random org: should FAIL because RLS denies write on org_sequences
random_org = str(uuid.uuid4())
sql = f"""BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claim.sub = '{fake_uid}';
  SELECT public.next_org_sequence('{random_org}'::uuid, 'invoice');
ROLLBACK;"""
_, err, rc = q(sql)
check(rc != 0 and ("row-level security" in err.lower()
                   or "permission denied" in err.lower()
                   or "policy" in err.lower()),
      "next_org_sequence for foreign org rejected by RLS")

# approve_rental_application still guards via is_org_member
sql = f"""BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claim.sub = '{fake_uid}';
  SELECT public.approve_rental_application(
    '{uuid.uuid4()}'::uuid, '{uuid.uuid4()}'::uuid,
    CURRENT_DATE, CURRENT_DATE + 30, 1000);
ROLLBACK;"""
_, err, rc = q(sql)
check(rc != 0, "approve_rental_application rejects unauthorized caller")

print(f"\n===== SUMMARY: {passed}/{passed+failed} passed =====")
sys.exit(0 if failed == 0 else 1)
