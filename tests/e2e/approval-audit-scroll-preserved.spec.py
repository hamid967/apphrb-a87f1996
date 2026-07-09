"""
Approval audit trail — scroll-position preservation on live refresh:

Same live-refresh scenario as approval-audit-live-refresh, but this test
locks in a specific UX guarantee: when the ApprovalAuditTrail hydrates
from empty → 2-event timeline via background refetch (no navigation, no
F5), the reviewer's current scroll position (window.scrollY) must NOT
jump. TanStack Query does an in-place cache update and React re-renders
the <ol> — nothing about that should scroll the page.

Flow:
  1. Owner seeds company + draft claim, purge audit_log rows.
  2. Reviewer opens /dashboard/expenses/review (Returned tab), expands
     the trail — empty state visible.
  3. Scroll window to a non-zero position (target 400 px), remember it
     and plant a page-load marker.
  4. Insert 2 synthetic audit_log rows via psql.
  5. Wait past staleTime, dispatch focus/visibilitychange so
     TanStack Query refetches in place.
  6. Assert:
       - marker still present (no reload),
       - <ol.border-s> now has 2 <li>,
       - window.scrollY is within ±4 px of the pre-refetch value,
       - html[dir=rtl] + lang=ar still hold.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/approval-audit-scroll-preserved.spec.py
"""
import asyncio
import importlib.util
import json
import os
import sys
import time as _time
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
SHOTS = Path("/tmp/browser/approval-audit-scroll-preserved")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

RETURNED_TAB_AR = "مُرجَعة"
RETURNED_TAB_EN = "Returned"
TRAIL_TITLE_AR = "سجل التدقيق"
EMPTY_COPY_AR = "لا توجد قرارات مسجّلة بعد."
EMPTY_COPY_EN = "No decisions recorded yet."

# Component uses staleTime: 15_000, so a focus event only triggers a
# background refetch after that window.
STALE_WAIT_S = 16.0
# Tolerance for browser sub-pixel scroll rounding.
SCROLL_TOLERANCE_PX = 4
# Target scroll position — enough to prove we're not at the top, small
# enough that even a short review page can reach it.
TARGET_SCROLL_Y = 400


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
                             body={"_name": "E2E Audit Scroll Co",
                                   "_phone": "0500000096"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            slug = f"SCRL-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit scroll-preserve claim",
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

            psql(f"DELETE FROM public.audit_log "
                 f"WHERE entity='expense_claims' "
                 f"AND entity_id='{claim_id}'")

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
            await rs.elevate_aal2(a_page, a_tok["access_token"])
            a_uid = a_tok["user_id"]
            rs.report("super_admin AAL2 elevate", True)

            await a_page.goto(
                f"{BASE}/dashboard/expenses/review",
                wait_until="domcontentloaded",
            )

            dir_attr = await a_page.evaluate(
                "document.documentElement.getAttribute('dir')")
            is_ar = await a_page.evaluate(
                "(document.documentElement.getAttribute('lang')||'')"
                ".startsWith('ar')")
            rtl_ok = dir_attr == "rtl" and bool(is_ar)
            rs.report("dashboard html[dir=rtl] + lang=ar (initial)",
                      rtl_ok, f"dir={dir_attr} ar={is_ar}")
            if not rtl_ok:
                failures += 1

            # Claim status is `draft` → lives in the "Returned" tab.
            try:
                await a_page.get_by_role(
                    "tab", name=RETURNED_TAB_AR).click(timeout=5000)
            except Exception:
                await a_page.get_by_role(
                    "tab", name=RETURNED_TAB_EN).click(timeout=5000)

            await a_page.wait_for_selector(f"text=EC-{slug}", timeout=8000)
            await a_page.get_by_role(
                "button", name=TRAIL_TITLE_AR
            ).first.click(timeout=5000)

            # Empty-state must be present before we insert anything.
            initial_empty = (
                await a_page.get_by_text(EMPTY_COPY_AR, exact=False).count()
                + await a_page.get_by_text(EMPTY_COPY_EN, exact=False).count()
            )
            initial_ok = initial_empty >= 1
            rs.report("initial empty-state visible",
                      initial_ok, f"matches={initial_empty}")
            if not initial_ok:
                failures += 1

            # Plant a page-load marker to detect any reload.
            marker = f"audit-scroll-{os.getpid()}-{int(_time.time())}"
            await a_page.evaluate(
                "(m) => { window.__auditScrollMarker = m; }", marker
            )

            # ---------- Establish a non-zero scroll position --------
            # Some review pages are short; grow the viewport contents by
            # scrolling to a target, then read back what the browser
            # actually gave us (clamped to max scroll). We only need
            # scrollY > 0 to prove preservation is meaningful.
            await a_page.evaluate(
                f"() => window.scrollTo({{ top: {TARGET_SCROLL_Y}, "
                "left: 0, behavior: 'instant' }})"
            )
            # Small settle delay so any layout-driven scroll clamp lands.
            await a_page.wait_for_timeout(100)
            scroll_before = await a_page.evaluate(
                "() => Math.round(window.scrollY)")
            scroll_pos_ok = scroll_before > 0
            rs.report("scrolled to non-zero position before refetch",
                      scroll_pos_ok, f"scrollY={scroll_before}")
            if not scroll_pos_ok:
                failures += 1

            # ---------- Insert synthetic audit_log rows -------------
            insert_sql = f"""
INSERT INTO public.audit_log(entity, entity_id, actor, action, diff, created_at)
VALUES
 ('expense_claims', '{claim_id}', '{a_uid}', 'UPDATE',
  jsonb_build_object(
    'before', jsonb_build_object('status', 'draft'),
    'after',  jsonb_build_object('status', 'submitted'),
    'org_id', '{org_id}',
    'app_roles', '["super_admin"]'::jsonb
  ),
  now() - interval '2 seconds'),
 ('expense_claims', '{claim_id}', '{a_uid}', 'UPDATE',
  jsonb_build_object(
    'before', jsonb_build_object('status', 'submitted'),
    'after',  jsonb_build_object('status', 'approved'),
    'org_id', '{org_id}',
    'app_roles', '["super_admin"]'::jsonb
  ),
  now())
"""
            psql(insert_sql)
            inserted = int(psql(
                "SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}'"
            ))
            insert_ok = inserted == 2
            rs.report("synthetic audit rows inserted",
                      insert_ok, f"count={inserted}")
            if not insert_ok:
                return 1 + failures

            # ---------- Wait past staleTime, trigger focus ----------
            rs.report(f"waiting {STALE_WAIT_S}s for TanStack Query "
                      "staleTime to expire", True)
            await asyncio.sleep(STALE_WAIT_S)

            # Fire focus + visibilitychange without any user-input that
            # would move the scroll (no keyboard PgDn, no mouse wheel).
            await a_page.evaluate("""
              () => {
                try {
                  Object.defineProperty(document, 'visibilityState',
                    { configurable: true, get: () => 'visible' });
                } catch (_) {}
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('focus'));
                window.dispatchEvent(new Event('online'));
              }
            """)

            # ---------- Assert: no reload happened ------------------
            marker_after = await a_page.evaluate(
                "() => window.__auditScrollMarker || null"
            )
            no_reload_ok = marker_after == marker
            rs.report("no page reload occurred",
                      no_reload_ok, f"after={marker_after!r}")
            if not no_reload_ok:
                failures += 1

            # ---------- Wait for timeline to hydrate ----------------
            trail = a_page.locator("ol.border-s").first
            try:
                await trail.locator("li").first.wait_for(
                    state="visible", timeout=10_000)
            except Exception:
                pass

            count = await trail.locator("li").count()
            count_ok = count == 2
            rs.report("timeline hydrated with 2 events after refetch",
                      count_ok, f"got={count}")
            if not count_ok:
                failures += 1

            # ---------- The main assertion: scroll unchanged --------
            # Give the browser one more frame in case the DOM update
            # lands after our marker check.
            await a_page.wait_for_timeout(150)
            scroll_after = await a_page.evaluate(
                "() => Math.round(window.scrollY)")
            drift = abs(scroll_after - scroll_before)
            scroll_stable_ok = drift <= SCROLL_TOLERANCE_PX
            rs.report(
                "window.scrollY preserved across empty→timeline refetch",
                scroll_stable_ok,
                f"before={scroll_before} after={scroll_after} "
                f"drift={drift} tol={SCROLL_TOLERANCE_PX}",
            )
            if not scroll_stable_ok:
                failures += 1

            # RTL sanity post-refetch.
            dir2 = await a_page.evaluate(
                "document.documentElement.getAttribute('dir')")
            rtl2_ok = dir2 == "rtl"
            rs.report("RTL still active after refetch",
                      rtl2_ok, f"dir={dir2}")
            if not rtl2_ok:
                failures += 1

            await a_page.screenshot(
                path=str(SHOTS / "scroll_preserved_rtl.png"))

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
