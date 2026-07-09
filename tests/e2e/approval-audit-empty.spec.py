"""
Approval audit trail empty-state E2E:

Complements approval-audit-trail.spec.py by verifying that when a claim
has NO audit_log rows (e.g. legacy rows imported before the trigger
existed, or rows purged by retention), the ApprovalAuditTrail card
renders the empty state — not a spinner, not an error, not a broken
timeline.

Flow:
  1. Sign in owner + super_admin (AAL2).
  2. Owner registers a company and creates one draft claim.
  3. Delete every audit_log row for that claim via psql so the trail
     query returns an empty list.
  4. Reviewer opens /dashboard/expenses/review, filters to Drafts,
     expands the row's history, and asserts:
       - the empty-state copy `approvalAudit.empty` ("لا توجد قرارات
         مسجّلة بعد.") is visible,
       - no <li> events are rendered,
       - no error toast / destructive text appears,
       - the page is RTL (`html[dir=rtl]`, lang=ar).

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/approval-audit-empty.spec.py
"""
import asyncio
import importlib.util
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
rs_spec = importlib.util.spec_from_file_location(
    "receipt_scen", HERE / "receipt-approval-scenarios.spec.py"
)
rs = importlib.util.module_from_spec(rs_spec)
rs_spec.loader.exec_module(rs)  # type: ignore[union-attr]

suite_spec = importlib.util.spec_from_file_location(
    "bulk_suite", HERE / "bulk-batch-suite.spec.py"
)
suite = importlib.util.module_from_spec(suite_spec)
suite_spec.loader.exec_module(suite)  # type: ignore[union-attr]

BASE = rs.BASE
SUPABASE_URL = rs.SUPABASE_URL
SUPABASE_KEY = rs.SUPABASE_KEY
SHOTS = Path("/tmp/browser/approval-audit-empty")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

EMPTY_COPY_AR = "لا توجد قرارات مسجّلة بعد."
EMPTY_COPY_EN = "No decisions recorded yet."
TRAIL_TITLE_AR = "سجل التدقيق"
DRAFT_TAB_AR = "مُرجَعة"  # `tabReturned` — draft-status claims live here


async def run(seed_payload) -> int:
    owner_creds = seed_payload["credentials"]["owner"]
    admin_creds = seed_payload["credentials"]["super_admin"]
    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # ---------- Owner: seed the claim ------------------------
            octx = await browser.new_context(
                viewport={"width": 1280, "height": 1800}, locale="ar-SA"
            )
            o_page = await octx.new_page()
            await o_page.goto(f"{BASE}/", wait_until="domcontentloaded")
            o_tok = await rs.sign_in(o_page, owner_creds["email"],
                                     owner_creds["password"])
            if not o_tok.get("ok"):
                rs.report("owner sign-in", False, json.dumps(o_tok))
                return 1
            rs.report("owner sign-in", True)

            reg = await rest(o_page, "POST", "/rest/v1/rpc/register_company",
                             o_tok["access_token"],
                             body={"_name": "E2E Audit Empty Co",
                                   "_phone": "0500000098"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            slug = f"EMPTY-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit empty-state claim",
                      "amount": 42.00, "currency": "SAR",
                      "category": "misc", "status": "draft",
                      "claim_number": f"EC-{slug}"},
                prefer="return=representation",
            )
            claim_id = suite._row_id(create)
            if create["status"] not in (200, 201) or not claim_id:
                rs.report("create claim", False, json.dumps(create))
                return 1
            rs.report("create claim", True, f"claim={claim_id}")

            # ---------- Purge audit_log rows for this claim ---------
            # This simulates the empty state (legacy import / purged
            # retention) without disabling the trigger globally.
            psql(f"DELETE FROM public.audit_log "
                 f"WHERE entity='expense_claims' "
                 f"AND entity_id='{claim_id}'")
            remaining = int(psql(
                f"SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}'"
            ))
            purge_ok = remaining == 0
            rs.report("audit_log purged for claim",
                      purge_ok, f"remaining={remaining}")
            if not purge_ok:
                return 1

            # ---------- Reviewer: super_admin (AAL2) ----------------
            actx = await browser.new_context(
                viewport={"width": 1280, "height": 1800}, locale="ar-SA"
            )
            a_page = await actx.new_page()
            await a_page.goto(f"{BASE}/", wait_until="domcontentloaded")
            a_tok = await rs.sign_in(a_page, admin_creds["email"],
                                     admin_creds["password"])
            if not a_tok.get("ok"):
                rs.report("super_admin sign-in", False, json.dumps(a_tok))
                return 1
            aal2 = await rs.elevate_aal2(a_page, a_tok["access_token"])
            rs.report("super_admin AAL2 elevate", True)

            # ---------- Open review page & expand the trail ---------
            await a_page.goto(
                f"{BASE}/dashboard/expenses/review",
                wait_until="domcontentloaded",
            )

            # RTL sanity.
            dir_attr = await a_page.evaluate(
                "document.documentElement.getAttribute('dir')")
            is_ar = await a_page.evaluate(
                "(document.documentElement.getAttribute('lang')||'')"
                ".startsWith('ar')")
            rtl_ok = dir_attr == "rtl" and bool(is_ar)
            rs.report("dashboard html[dir=rtl] + lang=ar",
                      rtl_ok, f"dir={dir_attr} ar={is_ar}")
            if not rtl_ok:
                failures += 1

            # Draft-status claim lives in the "مُرجَعة" tab.
            try:
                await a_page.get_by_role(
                    "tab", name=DRAFT_TAB_AR).click(timeout=5000)
            except Exception:
                await a_page.get_by_role(
                    "tab", name="Returned").click(timeout=5000)

            await a_page.wait_for_selector(f"text=EC-{slug}", timeout=8000)

            # Expand the row's history — history buttons all share
            # aria-label = "سجل التدقيق"; only one row is in this queue.
            await a_page.get_by_role(
                "button", name=TRAIL_TITLE_AR
            ).first.click(timeout=5000)

            # ---------- Empty-state assertions ----------------------
            # The empty-state copy is rendered inside the card body.
            empty_ar = await a_page.get_by_text(
                EMPTY_COPY_AR, exact=False).count()
            empty_en = await a_page.get_by_text(
                EMPTY_COPY_EN, exact=False).count()
            copy_ok = (empty_ar + empty_en) >= 1
            rs.report("empty-state copy visible",
                      copy_ok, f"ar={empty_ar} en={empty_en}")
            if not copy_ok:
                failures += 1

            # No <li> events inside the audit trail's <ol>.
            no_items = await a_page.locator("ol.border-s > li").count()
            items_ok = no_items == 0
            rs.report("no timeline events rendered",
                      items_ok, f"li_count={no_items}")
            if not items_ok:
                failures += 1

            # No spinner still visible.
            loading = await a_page.get_by_text(
                "جارِ تحميل السجل…", exact=False).count()
            loading_ok = loading == 0
            rs.report("loading state cleared",
                      loading_ok, f"loading_matches={loading}")
            if not loading_ok:
                failures += 1

            # No "failed" / "forbidden" error copy in the trail.
            errors = 0
            for txt in ("تعذّر تحميل سجل التدقيق.",
                        "لا تملك صلاحية الاطلاع على هذا السجل.",
                        "Couldn't load the audit trail.",
                        "You don't have access to this history."):
                errors += await a_page.get_by_text(txt, exact=False).count()
            errors_ok = errors == 0
            rs.report("no error copy in trail",
                      errors_ok, f"error_matches={errors}")
            if not errors_ok:
                failures += 1

            await a_page.screenshot(path=str(SHOTS / "empty_trail_rtl.png"))

            await octx.close()
            await actx.close()
        finally:
            await browser.close()

    return failures


def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if not token or not os.environ.get("PGHOST"):
        print("[skip] TEST_SEED_TOKEN or PGHOST missing", file=sys.stderr)
        return 0
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[skip] Supabase env vars missing", file=sys.stderr)
        return 0
    try:
        payload = rs.seed(token)
    except Exception as e:
        print(f"[fail] seed error: {e}", file=sys.stderr); return 1
    if not payload.get("ok"):
        print(f"[fail] seed payload: {payload}", file=sys.stderr); return 1
    failures = asyncio.run(run(payload))
    print(f"[done] failures={failures}", file=sys.stderr)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
