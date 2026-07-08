#!/usr/bin/env python3
"""Compare live DB (RLS/GRANTs/policies) vs 02-database-schema.md spec.
Usage: python3 scripts/spec_diff.py
"""
import subprocess, json, sys

# Spec table -> implementation table (renames)
SPEC_MAP = {
    "companies": "companies",
    "profiles": "profiles",
    "subscription_plans": "packages",
    "subscriptions": "subscriptions",
    "payment_receipts": "subscription_payments",
    "property_owners": "owners",
    "properties": "properties",
    "units": "units",
    "tenants": "tenants",
    "contracts": "contracts",
    "rent_payments": "rent_charges",
    "maintenance_requests": "maintenance_tickets",
    "expenses": "expenses",
    "notifications": "notifications",
}

# Anon reads allowed per spec (public catalog only)
ANON_READ_OK = {"packages", "properties"}  # public catalog + published listings

def q(sql):
    r = subprocess.run(["psql","-Atc",sql], capture_output=True, text=True, check=True)
    return [l.split("|") for l in r.stdout.strip().splitlines() if l]

def main():
    rls = {t: (e in ("t","true")) for t, e in q(
        "SELECT c.relname, c.relrowsecurity FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relkind='r'")}

    grants = {}
    rows = q("SELECT c.relname, r.rolname, p.privilege_type "
             "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, "
             "pg_roles r, LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege_type) "
             "WHERE n.nspname='public' AND c.relkind='r' "
             "AND r.rolname IN ('anon','authenticated','service_role') "
             "AND has_table_privilege(r.oid, c.oid, p.privilege_type)")
    for t, g, pr in rows:
        grants.setdefault(t, {}).setdefault(g, set()).add(pr)

    pol = {}
    for row in q("SELECT tablename, cmd FROM pg_policies WHERE schemaname='public'"):
        t, c = row
        pol.setdefault(t, set()).add(c)

    issues = []
    ok = []
    for spec, impl in SPEC_MAP.items():
        line = f"{spec:22} → {impl:22}"
        if impl not in rls:
            issues.append(f"❌ MISSING TABLE   {line}"); continue
        if not rls[impl]:
            issues.append(f"❌ RLS DISABLED    {line}"); continue
        g = grants.get(impl, {})
        auth_g = g.get("authenticated", set())
        need = {"SELECT","INSERT","UPDATE","DELETE"}
        missing = need - auth_g
        if missing:
            issues.append(f"⚠️  authenticated missing {missing}  {line}"); continue
        anon_g = g.get("anon", set())
        if anon_g and impl not in ANON_READ_OK:
            issues.append(f"⚠️  anon has {anon_g} (spec: none)  {line}"); continue
        if impl not in pol:
            issues.append(f"⚠️  NO POLICIES     {line}"); continue
        ok.append(f"✅ {line}  policies={sorted(pol[impl])}  auth=ALL")

    print("── Spec ↔ Implementation ──")
    for l in ok: print(l)
    print()
    if issues:
        print("── Issues ──")
        for l in issues: print(l)
        sys.exit(1)
    print("✔ No differences — schema matches spec.")

if __name__ == "__main__":
    main()
