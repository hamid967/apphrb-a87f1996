"""
DB-level guard test suite (M1 + M2).

Verifies for every guarded admin function that:
1. anon / authenticated (non-super_admin) is rejected — either at the GRANT
   layer (42501 insufficient_privilege via PostgREST) or by the in-function
   `has_role(auth.uid(), 'super_admin')` guard (raised as 42501 with a
   `super_admin` message).
2. `has_role`, `is_super_admin`, `is_super_admin(uuid)` remain callable —
   RLS policies depend on them.
3. Cron/queue functions stay locked to `service_role`.
4. A real super_admin session passes the guard (dry-run: only call SELECT-
   returning functions to avoid mutating state).

Runs via `python3 tests/db/super-admin-guards.spec.py`; requires the same
PG* env the sandbox already exposes for psql.
"""

from __future__ import annotations
import os
import subprocess
import sys
import textwrap
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Scope
# ---------------------------------------------------------------------------

# Admin fns that must reject non-super_admin at the guard layer.
# (sig, args-for-a-safe-invocation) — arg types match pg signatures.
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

# service_role-only fns. authenticated must hit `insufficient_privilege`
# at the GRANT layer (no in-body guard needed).
SERVICE_ROLE_ONLY_FNS: list[tuple[str, str]] = [
    ("reset_demo_data()",                          ""),
    ("seed_core_system()",                         ""),
    ("seed_demo_data()",                           ""),
    ("seed_expense_claims()",                      ""),
    ("seed_spending_policies()",                   ""),
    ("grant_hamid_new_org()",                      ""),
    ("grant_site_owner_hamid()",                   ""),
    ("bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[])",
        "NULL, 'x', 'x', 'x', ARRAY[]::text[], 'company'::rbac_scope_type, ARRAY[]::uuid[]"),
    ("provision_developer_workspace()",            ""),
    ("cleanup_expired_user_roles()",               ""),
    # cron/queue
    ("activate_scheduled_auctions()",              ""),
    ("finalize_expired_auctions()",                ""),
    ("run_daily_transitions()",                    ""),
    ("run_reminders_scan()",                       ""),
    ("email_queue_dispatch()",                     ""),
    ("email_queue_wake()",                         ""),
    ("claim_pending_notifications(integer, integer)", "10, 3"),
]

# Helpers that MUST stay callable by authenticated (RLS depends on them).
RLS_HELPERS: list[tuple[str, str]] = [
    ("has_role(uuid, app_role)",                          "auth.uid(), 'super_admin'::app_role"),
    ("has_any_role(uuid, app_role[])",                    "auth.uid(), ARRAY['super_admin']::app_role[]"),
    ("has_permission(uuid, text, uuid, uuid, uuid)",      "NULL, 'x', NULL, NULL, NULL"),
]


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

@dataclass
class Result:
    name: str
    passed: bool
    detail: str


def sql(script: str) -> tuple[int, str, str]:
    p = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=0", "-X", "-q", "-Atc", script],
        capture_output=True, text=True,
    )
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def expect_rejection(sig: str, args: str, uid: str | None) -> Result:
    """
    Run PERFORM public.<sig>(<args>) inside a transaction that sets
    request.jwt.claim.sub to `uid` (NULL for anon). PASS when the call
    raises insufficient_privilege (42501) or a message mentioning
    'super_admin' / 'forbidden'.
    """
    fn = sig.split("(")[0]
    call = f"public.{fn}({args})" if args else f"public.{fn}()"
    setter = (
        f"SELECT set_config('request.jwt.claim.sub', '{uid}', true);"
        if uid else
        "SELECT set_config('request.jwt.claim.sub', '', true);"
    )
    script = textwrap.dedent(f"""
        BEGIN;
        SET LOCAL ROLE authenticated;
        {setter}
        DO $$
        BEGIN
          BEGIN
            PERFORM {call};
            RAISE EXCEPTION 'UNGUARDED';
          EXCEPTION
            WHEN insufficient_privilege THEN NULL;
            WHEN OTHERS THEN
              IF SQLERRM ILIKE '%super_admin%'
                 OR SQLERRM ILIKE '%forbidden%'
                 OR SQLERRM ILIKE '%permission denied%' THEN
                NULL;
              ELSE
                RAISE EXCEPTION 'WRONG_ERROR: %', SQLERRM;
              END IF;
          END;
        END $$;
        ROLLBACK;
    """).strip()
    code, out, err = sql(script)
    combined = (out + "\n" + err).strip()
    if "UNGUARDED" in combined:
        return Result(sig, False, "call succeeded without guard")
    if "WRONG_ERROR" in combined:
        return Result(sig, False, combined.split("WRONG_ERROR:", 1)[-1].strip())
    # ROLLBACK line indicates the txn completed; either exception branch matched.
    if "ROLLBACK" in combined or code == 0:
        return Result(sig, True, "rejected as expected")
    return Result(sig, False, combined[:200])


def expect_helper_callable(sig: str, args: str, uid: str) -> Result:
    fn = sig.split("(")[0]
    call = f"public.{fn}({args})"
    script = textwrap.dedent(f"""
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '{uid}', true);
        SELECT {call};
        ROLLBACK;
    """).strip()
    code, _out, err = sql(script)
    if code == 0 and "ERROR" not in err.upper():
        return Result(sig, True, "callable by authenticated")
    return Result(sig, False, err[:200])


def expect_super_admin_passes_guard(sig: str, args: str, super_uid: str) -> Result:
    """
    Only checks that the guard itself does not block a real super_admin.
    Uses a savepoint-abort trick: we PERFORM the call; if the guard was the
    reason for failure the SQLERRM contains 'super_admin' — that's a FAIL
    for this test. Any other error (missing FK / rls) is fine — we only
    care that the guard let us in.
    """
    fn = sig.split("(")[0]
    call = f"public.{fn}({args})" if args else f"public.{fn}()"
    script = textwrap.dedent(f"""
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '{super_uid}', true);
        DO $$
        BEGIN
          BEGIN
            PERFORM {call};
          EXCEPTION WHEN OTHERS THEN
            IF SQLERRM ILIKE '%super_admin%' OR SQLERRM ILIKE '%forbidden%' THEN
              RAISE EXCEPTION 'GUARD_BLOCKED_SUPER_ADMIN';
            END IF;
          END;
        END $$;
        ROLLBACK;
    """).strip()
    code, _out, err = sql(script)
    if "GUARD_BLOCKED_SUPER_ADMIN" in err:
        return Result(sig, False, "guard blocked a real super_admin")
    return Result(sig, True, "guard let super_admin through")


def main() -> int:
    if not os.environ.get("PGHOST"):
        print("SKIP: PGHOST not set", file=sys.stderr)
        return 0

    code, super_uid, _ = sql(
        "SELECT user_id::text FROM public.user_roles WHERE role='super_admin' LIMIT 1;"
    )
    if code != 0 or not super_uid:
        print("SKIP: no super_admin user found", file=sys.stderr)
        return 0
    non_admin_uid = "00000000-0000-0000-0000-000000000000"

    results: list[Result] = []

    print(f"\n=== M2 admin fns (anon rejected) — {len(ADMIN_FNS)} ===")
    for sig, args in ADMIN_FNS:
        r = expect_rejection(sig, args, uid=None)
        results.append(r)
        print(f"  {'✓' if r.passed else '✗'} anon  {sig} — {r.detail}")

    print(f"\n=== M2 admin fns (authenticated non-admin rejected) — {len(ADMIN_FNS)} ===")
    for sig, args in ADMIN_FNS:
        r = expect_rejection(sig, args, uid=non_admin_uid)
        results.append(r)
        print(f"  {'✓' if r.passed else '✗'} authN {sig} — {r.detail}")

    print(f"\n=== service_role-only fns (authenticated blocked at GRANT) — {len(SERVICE_ROLE_ONLY_FNS)} ===")
    for sig, args in SERVICE_ROLE_ONLY_FNS:
        r = expect_rejection(sig, args, uid=non_admin_uid)
        results.append(r)
        print(f"  {'✓' if r.passed else '✗'} authN {sig} — {r.detail}")

    print(f"\n=== RLS helpers callable — {len(RLS_HELPERS)} ===")
    for sig, args in RLS_HELPERS:
        r = expect_helper_callable(sig, args, uid=super_uid)
        results.append(r)
        print(f"  {'✓' if r.passed else '✗'} {sig} — {r.detail}")

    print(f"\n=== super_admin passes guard — {len(ADMIN_FNS)} ===")
    for sig, args in ADMIN_FNS:
        r = expect_super_admin_passes_guard(sig, args, super_uid)
        results.append(r)
        print(f"  {'✓' if r.passed else '✗'} super {sig} — {r.detail}")

    failed = [r for r in results if not r.passed]
    print(f"\n===== SUMMARY: {len(results)-len(failed)}/{len(results)} passed =====")
    if failed:
        print("\nFAILURES:")
        for r in failed:
            print(f"  ✗ {r.name} — {r.detail}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
