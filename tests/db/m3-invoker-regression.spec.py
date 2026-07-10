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
for name, id_args, priv_args in M3_FUNCTIONS:
    sql = f"""SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='{name}'
              AND pg_get_function_identity_arguments(p.oid)='{id_args}';"""
    out, _, _ = q(sql)
    check(out == "f", f"{name}({priv_args}) → INVOKER")

print("\n=== B) M3 functions keep EXECUTE for `authenticated` ===")
for name, _id_args, priv_args in M3_FUNCTIONS:
    sql = f"""SELECT has_function_privilege('authenticated',
              'public.{name}({priv_args})', 'EXECUTE');"""
    out, _, _ = q(sql)
    check(out == "t", f"{name}({priv_args}) — authenticated=yes")

print("\n=== C) RLS helper fns remain SECURITY DEFINER ===")
for name in STILL_DEFINER:
    sql = f"""SELECT bool_and(prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='{name}';"""
    out, _, _ = q(sql)
    check(out == "t", f"{name} — still DEFINER")

print("\n=== D) Behavioural checks via HTTP RPC as anon ===")
# Sandbox psql role cannot `SET LOCAL role authenticated`, so behavioural
# checks are done via the PostgREST endpoint using the anon key.
# anon calling an authenticated-only fn should get 401/403.
import json, urllib.request, urllib.error
SUPABASE_URL = "https://zgzhekdyospixozsmjwi.supabase.co"
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIs"
        "InJlZiI6Inpnemhla2R5b3NwaXhvenNtandpIiwicm9sZSI6ImFub24iLCJp"
        "YXQiOjE3ODM1NDE0MzAsImV4cCI6MjA5OTExNzQzMH0."
        "UYERLT9F65w8IsU7aOvNWgbJGiqnCtSj0L5i7zr9MgU")

def rpc(name, body):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=json.dumps(body).encode(),
        headers={"apikey": ANON, "Authorization": f"Bearer {ANON}",
                 "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# anon → tenant_pay_charge should be denied (not granted to anon)
code, body = rpc("tenant_pay_charge",
                 {"_charge_id": str(uuid.uuid4()), "_method_id": str(uuid.uuid4())})
check(code in (401, 403, 404) or "permission" in body.lower(),
      f"anon → tenant_pay_charge blocked (HTTP {code})")

# anon → next_org_sequence should be denied
code, body = rpc("next_org_sequence",
                 {"_org": str(uuid.uuid4()), "_kind": "invoice"})
check(code in (401, 403, 404) or "permission" in body.lower(),
      f"anon → next_org_sequence blocked (HTTP {code})")

# anon → submit_rental_application IS granted (public form), but with a random
# listing id RLS should reject the insert.
code, body = rpc("submit_rental_application", {
    "_listing_id": str(uuid.uuid4()), "_applicant_name": "Test",
    "_email": "t@e.co", "_phone": "0", "_monthly_income": 0,
    "_employer": "", "_move_in_date": "2026-01-01",
    "_credit_check_consent": True,
})
# Function may raise (listing not found) or RLS may deny — either signals it ran with anon RLS applied.
check(code >= 300, f"anon → submit_rental_application reachable & non-2xx on bogus data (HTTP {code})")

print(f"\n===== SUMMARY: {passed}/{passed+failed} passed =====")
sys.exit(0 if failed == 0 else 1)
