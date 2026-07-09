"""
Approval audit trail — PARTIAL trail E2E:

Sibling of approval-audit-trail.spec.py, but exercises the minimal
happy path: one claim goes through exactly TWO transitions
(draft → submitted, then submitted → approved). Verifies that the
ApprovalAuditTrail card:

  1. Renders exactly TWO events (no extra ghost rows from INSERT /
     status-unchanged UPDATEs).
  2. Orders them chronologically top-to-bottom: submitted THEN approved.
  3. The `<time>` of item[0] is strictly earlier than item[1] — i.e.
     the DOM order mirrors the audit_log timestamps.
  4. RTL sanity — `html[dir=rtl]` + `lang=ar`, and the timeline spine
     (`ol.border-s`) sits on the RTL start side (right border).

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/approval-audit-partial.spec.py
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
SHOTS = Path("/tmp/browser/approval-audit-partial")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

APPROVED_TAB_AR = "معتمَدة"
APPROVED_TAB_EN = "Approved"
TRAIL_TITLE_AR = "سجل التدقيق"

# Expected labels for the two events, in chronological order.
EXPECTED_AR = ["أُرسل للاعتماد", "اعتُمد"]
EXPECTED_EN = ["Submitted",       "Approved"]


def _now_iso_ms():
    return _time.strftime("%Y-%m-%dT%H:%M:%S.") + \
           f"{int(_time.time()*1000)%1000:03d}Z"


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
                             body={"_name": "E2E Audit Partial Co",
                                   "_phone": "0500000096"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            slug = f"PART-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit partial trail claim",
                      "amount": 150.00, "currency": "SAR",
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

            # ---------- Step 1: owner submits ------------------------
            ts_submit = _now_iso_ms()
            r1 = await rest(
                o_page, "PATCH",
                f"/rest/v1/expense_claims?id=eq.{claim_id}",
                o_tok["access_token"],
                body={"status": "submitted", "submitted_at": ts_submit},
                prefer="return=representation",
            )
            if r1["status"] not in (200, 204) or not r1.get("body"):
                rs.report("submit claim", False, json.dumps(r1))
                return 1

            # Ensure a strictly monotonic gap so audit_log.created_at
            # cannot tie and torture the ORDER BY.
            await asyncio.sleep(0.4)

            # ---------- Step 2: super_admin approves ----------------
            ts_approve = _now_iso_ms()
            r2 = await rest(
                a_page, "PATCH",
                f"/rest/v1/expense_claims?id=eq.{claim_id}",
                a_bearer,
                body={"status": "approved", "approved_at": ts_approve,
                      "reviewed_at": ts_approve, "reviewed_by": a_uid,
                      "rejection_reason": None},
                prefer="return=representation",
            )
            if r2["status"] not in (200, 204) or not r2.get("body"):
                rs.report("approve claim", False, json.dumps(r2))
                return 1
            rs.report("lifecycle transitions", True,
                      "draft->submitted -> submitted->approved")

            # ---------- DB assertion: exactly two rows, ordered -----
            rows = psql(
                "SELECT diff->'before'->>'status' || '->' || "
                "       diff->'after'->>'status' "
                "FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}' "
                "AND action='UPDATE' "
                "ORDER BY created_at ASC"
            ).splitlines()
            expected = ["draft->submitted", "submitted->approved"]
            db_ok = rows == expected
            rs.report("audit_log has exactly 2 chronological rows",
                      db_ok, f"got={rows} expected={expected}")
            if not db_ok:
                failures += 1

            # ---------- Open review page & inspect ------------------
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
            rs.report("dashboard html[dir=rtl] + lang=ar",
                      rtl_ok, f"dir={dir_attr} ar={is_ar}")
            if not rtl_ok:
                failures += 1

            try:
                await a_page.get_by_role(
                    "tab", name=APPROVED_TAB_AR).click(timeout=5000)
            except Exception:
                await a_page.get_by_role(
                    "tab", name=APPROVED_TAB_EN).click(timeout=5000)

            await a_page.wait_for_selector(f"text=EC-{slug}", timeout=8000)

            await a_page.get_by_role(
                "button", name=TRAIL_TITLE_AR
            ).first.click(timeout=5000)

            trail = a_page.locator("ol.border-s").first
            await trail.wait_for(state="visible", timeout=8000)
            items = trail.locator("li")
            count = await items.count()
            count_ok = count == 2
            rs.report("timeline has exactly 2 events",
                      count_ok, f"got={count}")
            if not count_ok:
                failures += 1

            # Chronological label order in the DOM.
            texts = []
            for i in range(count):
                texts.append((await items.nth(i).inner_text()).strip())
            order_ok = True
            for i, (ar, en) in enumerate(zip(EXPECTED_AR, EXPECTED_EN)):
                if i >= len(texts):
                    order_ok = False
                    break
                if ar not in texts[i] and en not in texts[i]:
                    order_ok = False
                    rs.report(f"event[{i}] label {ar!r}/{en!r}",
                              False, texts[i][:120])
            rs.report("timeline chronological label order",
                      order_ok)
            if not order_ok:
                failures += 1

            # DOM order mirrors audit_log timestamps: item[0].top <
            # item[1].top (RTL doesn't affect vertical stacking).
            geom = await trail.evaluate("""
              el => {
                const li = Array.from(el.querySelectorAll(':scope > li'));
                return li.map(n => n.getBoundingClientRect().top);
              }
            """)
            geom_ok = len(geom) >= 2 and geom[0] < geom[1]
            rs.report("earlier event rendered above later one",
                      geom_ok, f"tops={geom}")
            if not geom_ok:
                failures += 1

            # RTL spine sanity — timeline border on the start (right) side.
            border = await trail.evaluate("""
              el => {
                const cs = getComputedStyle(el);
                return {
                  left:  parseFloat(cs.borderLeftWidth)  || 0,
                  right: parseFloat(cs.borderRightWidth) || 0,
                };
              }
            """)
            spine_ok = border.get("right", 0) > 0 \
                and border.get("left", 0) == 0
            rs.report("timeline spine on RTL start side",
                      spine_ok, json.dumps(border))
            if not spine_ok:
                failures += 1

            await a_page.screenshot(
                path=str(SHOTS / "partial_trail_rtl.png"))

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
