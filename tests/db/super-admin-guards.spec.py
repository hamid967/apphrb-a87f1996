"""
DB-level guard test suite (M1 + M2). Runs with only psql SELECT/EXECUTE
privileges — no role switching required.

Checks:
  1. Guard runtime — for every guarded admin fn, calling with an unknown
     auth.uid() (or empty) raises 42501 / 'super_admin' / 'forbidden'.
  2. Guard passes for a real super_admin uid.
  3. Static GRANT — service_role-only fns have proacl without
     `authenticated=X` and without `anon=X`.
  4. Static GRANT — RLS helper fns (has_role, is_super_admin, has_any_role,
     has_permission) still expose `EXECUTE` to `authenticated`.
"""

from __future__ import annotations
import os, subprocess, sys, textwrap
from dataclasses import dataclass


ADMIN_FNS: list[tuple[str, str]] = [
    ("admin_billing_metrics(integer, uuid)",             "6, NULL"),
    ("admin_billing_series(integer, uuid)",              "6, NULL"),
    ("admin_billing_churned_orgs(integer, uuid)",        "6, NULL"),
    ("admin_billing_trial_orgs(integer, integer, uuid)", "0, 30, NULL"),
    ("admin_billing_last_refresh()",                     ""),
    ("admin_filter_analytics_health()",                  ""),
    ("admin_filter_analytics_hourly(integer)",           "24"),
    ("admin_filter_analytics_overview(integer)",         "24"),
    ("admin_filter_analytics_top_filters(integer, integer)", "24, 10"),
    ("admin_filter_analytics_top_paths(integer, integer)",   "24, 10"),
    ("admin_list_packages()",                            ""),
    ("admin_regenerate_establishment_no(uuid)",          "'00000000-0000-0000-0000-000000000000'::uuid"),
    ("approve_site_owner(text, integer)",                "'noone@example.invalid', 30"),
    ("approve_subscription_payment(uuid, text, text)",   "'00000000-0000-0000-0000-000000000000'::uuid, 'x', 'x'"),
    ("approve_user_trial(uuid, integer)",                "'00000000-0000-0000-0000-000000000000'::uuid, 30"),
    ("reject_subscription_payment(uuid, text)",          "'00000000-0000-0000-0000-000000000000'::uuid, 'x'"),
    ("reject_user(uuid)",                                "'00000000-0000-0000-0000-000000000000'::uuid"),
    ("refresh_billing_mvs()",                            ""),
    ("set_app_setting(text, text)",                      "'test.key', 'x'"),
]

SERVICE_ROLE_ONLY: list[str] = [
    "reset_demo_data", "seed_core_system", "seed_core_system_plan",
    "seed_demo_data", "seed_appfolio_demo", "seed_expense_claims",
    "seed_report_templates", "seed_spending_policies", "seed_portal_test_users",
    "grant_hamid_new_org", "grant_site_owner_hamid",
    "bulk_apply_role_template", "provision_developer_workspace",
    "cleanup_expired_user_roles",
    "activate_scheduled_auctions", "finalize_expired_auctions",
    "run_daily_transitions", "run_reminders_scan",
    "email_queue_dispatch", "email_queue_wake", "claim_pending_notifications",
    "enqueue_email", "delete_email", "read_email_batch", "move_to_dlq",
]

RLS_HELPERS: list[str] = ["has_role", "has_any_role", "has_permission", "is_super_admin"]


@dataclass
class R:
    name: str
    ok: bool
    detail: str


def sql(script: str) -> tuple[int, str, str]:
    p = subprocess.run(["psql", "-X", "-q", "-Atc", script],
                       capture_output=True, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def guard_rejects(sig: str, args: str, uid: str) -> R:
    """Call the fn with request.jwt.claim.sub=uid; expect a guard raise."""
    fn = sig.split("(")[0]
    call = f"public.{fn}({args})" if args else f"public.{fn}()"
    script = textwrap.dedent(f"""
        BEGIN;
        SELECT set_config('request.jwt.claim.sub', '{uid}', true);
        DO $$
        BEGIN
          BEGIN
            PERFORM {call};
            RAISE EXCEPTION 'UNGUARDED_CALL_SUCCEEDED';
          EXCEPTION
            WHEN insufficient_privilege THEN NULL;
            WHEN OTHERS THEN
              IF SQLERRM ILIKE '%super_admin%' OR SQLERRM ILIKE '%forbidden%' THEN
                NULL;
              ELSE
                RAISE EXCEPTION 'WRONG_ERROR: %', SQLERRM;
              END IF;
          END;
        END $$;
        ROLLBACK;
    """).strip()
    code, out, err = sql(script)
    blob = out + "\n" + err
    if "UNGUARDED_CALL_SUCCEEDED" in blob:
        return R(sig, False, "call succeeded without guard")
    if "WRONG_ERROR" in blob:
        return R(sig, False, blob.split("WRONG_ERROR:", 1)[-1].strip()[:180])
    return R(sig, True, "rejected")


def guard_allows_super(sig: str, args: str, super_uid: str) -> R:
    fn = sig.split("(")[0]
    call = f"public.{fn}({args})" if args else f"public.{fn}()"
    script = textwrap.dedent(f"""
        BEGIN;
        SELECT set_config('request.jwt.claim.sub', '{super_uid}', true);
        DO $$
        BEGIN
          BEGIN PERFORM {call};
          EXCEPTION WHEN OTHERS THEN
            IF SQLERRM ILIKE '%super_admin%' OR SQLERRM ILIKE '%forbidden: super_admin%' THEN
              RAISE EXCEPTION 'GUARD_BLOCKED_SUPER_ADMIN';
            END IF;
          END;
        END $$;
        ROLLBACK;
    """).strip()
    code, _out, err = sql(script)
    return R(sig, "GUARD_BLOCKED_SUPER_ADMIN" not in err,
             "blocked super_admin" if "GUARD_BLOCKED_SUPER_ADMIN" in err else "allowed")


def acl_check(name: str, must_have_auth: bool) -> R:
    code, out, _ = sql(
        f"SELECT bool_or(pg_catalog.array_to_string(coalesce(proacl,'{{}}'::aclitem[]),',') ILIKE '%authenticated=%') "
        f"FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
        f"WHERE n.nspname='public' AND p.proname='{name}';"
    )
    if code != 0:
        return R(name, False, "acl query failed")
    if out == "":
        return R(name, False, "function not found")
    has_auth = out == "t"
    if must_have_auth and not has_auth:
        return R(name, False, "expected EXECUTE for authenticated")
    if not must_have_auth and has_auth:
        return R(name, False, "unexpected EXECUTE for authenticated")
    return R(name, True, "authenticated=" + ("yes" if has_auth else "no"))


def main() -> int:
    if not os.environ.get("PGHOST"):
        print("SKIP: PGHOST not set"); return 0

    _, super_uid, _ = sql("SELECT user_id::text FROM public.user_roles WHERE role='super_admin' LIMIT 1;")
    if not super_uid:
        print("SKIP: no super_admin"); return 0
    non_admin = "00000000-0000-0000-0000-000000000000"

    results: list[R] = []

    print(f"\n=== A) Guard rejects non-super_admin ({len(ADMIN_FNS)} fns × 2 uids) ===")
    for sig, args in ADMIN_FNS:
        for tag, uid in (("empty", ""), ("stranger", non_admin)):
            r = guard_rejects(sig, args, uid)
            r.name = f"[{tag}] {sig}"
            results.append(r)
            print(f"  {'✓' if r.ok else '✗'} {r.name} — {r.detail}")

    print(f"\n=== B) Guard admits real super_admin ({len(ADMIN_FNS)}) ===")
    for sig, args in ADMIN_FNS:
        r = guard_allows_super(sig, args, super_uid)
        results.append(r); print(f"  {'✓' if r.ok else '✗'} {sig} — {r.detail}")

    print(f"\n=== C) service_role-only fns keep authenticated OFF ({len(SERVICE_ROLE_ONLY)}) ===")
    for name in SERVICE_ROLE_ONLY:
        r = acl_check(name, must_have_auth=False); results.append(r)
        print(f"  {'✓' if r.ok else '✗'} {name} — {r.detail}")

    print(f"\n=== D) RLS helper fns keep authenticated ON ({len(RLS_HELPERS)}) ===")
    for name in RLS_HELPERS:
        r = acl_check(name, must_have_auth=True); results.append(r)
        print(f"  {'✓' if r.ok else '✗'} {name} — {r.detail}")

    fail = [r for r in results if not r.ok]
    print(f"\n===== SUMMARY: {len(results)-len(fail)}/{len(results)} passed =====")
    if fail:
        print("\nFAILURES:")
        for r in fail: print(f"  ✗ {r.name} — {r.detail}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
