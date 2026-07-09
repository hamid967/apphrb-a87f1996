"""
Approval audit trail — live refresh on the APPROVED tab:

Sibling of approval-audit-live-refresh.spec.py, but targeted at the
"معتمَدة" (Approved) tab of /dashboard/expenses/review. Verifies that
after the reviewer opens an EMPTY audit trail for an already-approved
claim, inserting new `audit_log` rows server-side hydrates the timeline
in place — no navigation, no F5 — and clears the `approvalAudit.empty`
copy.

Flow:
  1. Owner seeds a company + one claim.
  2. Super_admin (AAL2) PATCHes the claim straight to `approved`.
  3. Every audit_log row for that claim is purged via psql.
  4. Reviewer opens /dashboard/expenses/review, switches to Approved,
     expands the trail — empty state visible.
  5. A page-load marker is planted on `window`.
  6. Two synthetic audit_log rows are inserted (submitted, approved)
     spaced 2s apart.
  7. Wait past the 15 s staleTime, then dispatch focus/visibilitychange
     so TanStack Query refetches — no reload, no tab switch.
  8. Assert:
        - marker still present (no reload),
        - Approved tab still active,
        - `ol.border-s` now has exactly 2 `<li>` in the correct order,
        - `approvalAudit.empty` copy is gone,
        - `html[dir=rtl]` + `lang=ar` still hold.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/approval-audit-live-refresh-approved.spec.py
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
SHOTS = Path("/tmp/browser/approval-audit-live-refresh-approved")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

APPROVED_TAB_AR = "معتمَدة"
APPROVED_TAB_EN = "Approved"
TRAIL_TITLE_AR = "سجل التدقيق"
EMPTY_COPY_AR = "لا توجد قرارات مسجّلة بعد."
EMPTY_COPY_EN = "No decisions recorded yet."

EXPECTED_AR = ["أُرسل للاعتماد", "اعتُمد"]
EXPECTED_EN = ["Submitted",       "Approved"]

# Component uses staleTime: 15_000, so wait past it before focus events
# trigger a background refetch.
STALE_WAIT_S = 16.0


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
                             body={"_name": "E2E Audit Live Approved Co",
                                   "_phone": "0500000098"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            slug = f"LIVA-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit live-approved claim",
                      "amount": 55.00, "currency": "SAR",
                      "category": "misc", "status": "draft",
                      "claim_number": f"EC-{slug}"},
                prefer="return=representation",
            )
            claim_id = suite._row_id(create)
            if create["status"] not in (200, 201) or not claim_id:
                rs.report("create claim", False, json.dumps(create))
                return 1
            rs.report("create claim", True, f"claim={claim_id}")

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
            a_bearer = aal2.get("access_token", a_tok["access_token"])
            a_uid = a_tok["user_id"]
            rs.report("super_admin AAL2 elevate", True)

            # ---------- Drive claim straight to approved -------------
            ts = _time.strftime("%Y-%m-%dT%H:%M:%S.") + \
                f"{int(_time.time()*1000)%1000:03d}Z"
            approve = await rest(
                a_page, "PATCH",
                f"/rest/v1/expense_claims?id=eq.{claim_id}",
                a_bearer,
                body={"status": "approved", "approved_at": ts,
                      "reviewed_at": ts, "reviewed_by": a_uid,
                      "submitted_at": ts, "rejection_reason": None},
                prefer="return=representation",
            )
            if approve["status"] not in (200, 204) or not approve.get("body"):
                rs.report("approve claim", False, json.dumps(approve))
                return 1
            rs.report("approve claim", True)

            # Purge audit rows so the initial view is provably empty.
            psql(f"DELETE FROM public.audit_log "
                 f"WHERE entity='expense_claims' "
                 f"AND entity_id='{claim_id}'")
            remaining = int(psql(
                "SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}'"
            ))
            if remaining != 0:
                rs.report("audit_log purged", False, f"remaining={remaining}")
                return 1
            rs.report("audit_log purged", True)

            # ---------- Open review page & switch to Approved -------
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

            try:
                await a_page.get_by_role(
                    "tab", name=APPROVED_TAB_AR).click(timeout=5000)
            except Exception:
                await a_page.get_by_role(
                    "tab", name=APPROVED_TAB_EN).click(timeout=5000)

            # Confirm Approved tab is the active one before we start.
            active_before = await a_page.evaluate("""
              () => {
                const el = document.querySelector('[role="tab"][data-state="active"]');
                return el ? el.textContent.trim() : null;
              }
            """)
            approved_active = active_before and (
                APPROVED_TAB_AR in active_before
                or APPROVED_TAB_EN in active_before
            )
            rs.report("Approved tab active (initial)",
                      bool(approved_active), f"active={active_before!r}")
            if not approved_active:
                failures += 1

            await a_page.wait_for_selector(f"text=EC-{slug}", timeout=8000)
            await a_page.get_by_role(
                "button", name=TRAIL_TITLE_AR
            ).first.click(timeout=5000)

            initial_empty = (
                await a_page.get_by_text(EMPTY_COPY_AR, exact=False).count()
                + await a_page.get_by_text(EMPTY_COPY_EN, exact=False).count()
            )
            initial_ok = initial_empty >= 1
            rs.report("initial empty-state visible in Approved tab",
                      initial_ok, f"matches={initial_empty}")
            if not initial_ok:
                failures += 1

            # Plant a page-load marker on `window`.
            marker = f"audit-live-approved-{os.getpid()}-{int(_time.time())}"
            await a_page.evaluate(
                "(m) => { window.__auditLiveApprovedMarker = m; }", marker
            )
            marker_before = await a_page.evaluate(
                "() => window.__auditLiveApprovedMarker || null"
            )
            marker_ok = marker_before == marker
            rs.report("page-load marker planted",
                      marker_ok, f"marker={marker_before!r}")
            if not marker_ok:
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

            # ---------- Wait past staleTime, then trigger focus -----
            rs.report(f"waiting {STALE_WAIT_S}s for TanStack Query "
                      "staleTime to expire", True)
            await asyncio.sleep(STALE_WAIT_S)

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
            await a_page.mouse.move(400, 400)

            # ---------- Assert: no reload happened ------------------
            marker_after = await a_page.evaluate(
                "() => window.__auditLiveApprovedMarker || null"
            )
            no_reload_ok = marker_after == marker
            rs.report("no page reload occurred",
                      no_reload_ok,
                      f"before={marker_before!r} after={marker_after!r}")
            if not no_reload_ok:
                failures += 1

            # ---------- Assert: Approved tab still active -----------
            active_after = await a_page.evaluate("""
              () => {
                const el = document.querySelector('[role="tab"][data-state="active"]');
                return el ? el.textContent.trim() : null;
              }
            """)
            tab_stable_ok = active_after and (
                APPROVED_TAB_AR in active_after
                or APPROVED_TAB_EN in active_after
            )
            rs.report("Approved tab still active after refetch",
                      bool(tab_stable_ok), f"active={active_after!r}")
            if not tab_stable_ok:
                failures += 1

            # ---------- Assert: timeline hydrated -------------------
            trail = a_page.locator("ol.border-s").first
            try:
                await trail.locator("li").first.wait_for(
                    state="visible", timeout=10_000)
            except Exception:
                pass

            items = trail.locator("li")
            count = await items.count()
            count_ok = count == 2
            rs.report("timeline hydrated with 2 events after refetch",
                      count_ok, f"got={count}")
            if not count_ok:
                failures += 1

            # Empty-state copy must be gone.
            gone_ar = await a_page.get_by_text(
                EMPTY_COPY_AR, exact=False).count()
            gone_en = await a_page.get_by_text(
                EMPTY_COPY_EN, exact=False).count()
            gone_ok = (gone_ar + gone_en) == 0
            rs.report("approvalAudit.empty copy cleared",
                      gone_ok, f"ar={gone_ar} en={gone_en}")
            if not gone_ok:
                failures += 1

            # Chronological label order.
            order_ok = True
            texts = []
            for i in range(count):
                texts.append((await items.nth(i).inner_text()).strip())
            for i, (ar, en) in enumerate(zip(EXPECTED_AR, EXPECTED_EN)):
                if i >= len(texts):
                    order_ok = False
                    break
                if ar not in texts[i] and en not in texts[i]:
                    order_ok = False
                    rs.report(f"event[{i}] label {ar!r}/{en!r}",
                              False, texts[i][:120])
            rs.report("timeline chronological order after refetch",
                      order_ok)
            if not order_ok:
                failures += 1

            # RTL must still hold post-refetch.
            dir2 = await a_page.evaluate(
                "document.documentElement.getAttribute('dir')")
            rtl2_ok = dir2 == "rtl"
            rs.report("RTL still active after refetch",
                      rtl2_ok, f"dir={dir2}")
            if not rtl2_ok:
                failures += 1

            await a_page.screenshot(
                path=str(SHOTS / "live_refresh_approved_rtl.png"))

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
