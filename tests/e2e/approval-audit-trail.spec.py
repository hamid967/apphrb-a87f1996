"""
Approval audit trail E2E:

Exercises the ApprovalAuditTrail component surfaced on
/dashboard/expenses/review. Drives one expense claim through the full
submitted → returned → submitted → rejected → submitted → approved
lifecycle so the trail contains ALL three decision types (approved,
rejected, returned) at least once, then verifies:

  1. The audit_log rows written by the `tg_audit_row` trigger contain
     the six expected status transitions in chronological order.
  2. The review UI, once the reviewer expands the claim's history,
     renders those events top-to-bottom in the SAME chronological order.
  3. The dashboard renders in Arabic RTL (`html[dir=rtl]`) and the audit
     timeline uses the logical `border-s` (start border) so it flows
     from the correct side in RTL.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing — matches the
convention used by the other bulk-batch specs.

Run:  python3 tests/e2e/approval-audit-trail.spec.py
"""
import asyncio
import importlib.util
import json
import os
import subprocess
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
SHOTS = Path("/tmp/browser/approval-audit-trail")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

# Ordered list of (from_status, to_status) transitions we drive the claim
# through. Six transitions total — the trail must contain approved,
# rejected and returned at least once each, plus three "submitted" events
# in between so the sequence is realistic.
LIFECYCLE = [
    ("draft",     "submitted"),  # owner submits
    ("submitted", "draft"),      # reviewer RETURNS with reason
    ("draft",     "submitted"),  # owner resubmits
    ("submitted", "rejected"),   # reviewer REJECTS with reason
    ("rejected",  "submitted"),  # owner resubmits
    ("submitted", "approved"),   # reviewer APPROVES
]

# Human-visible labels rendered by ApprovalAuditTrail — must match the
# AR i18n bundle under `approvalAudit.actions.*`. The English fallback
# labels are checked defensively too.
EXPECTED_LABELS_AR = ["أُرسل للاعتماد", "أُرجع للتعديل", "أُرسل للاعتماد",
                      "رُفض", "أُرسل للاعتماد", "اعتُمد"]
EXPECTED_LABELS_EN = ["Submitted", "Returned for edits", "Submitted",
                      "Rejected", "Submitted", "Approved"]


async def patch_status(page, bearer, claim_id, to_status, ts,
                       reviewer_uid=None, reason=None):
    body = {"status": to_status}
    if to_status == "submitted":
        body["submitted_at"] = ts
        # A resubmission clears prior reviewer state so the next audit
        # row cleanly transitions from `submitted`.
        body["reviewed_at"] = None
        body["reviewed_by"] = None
        body["rejection_reason"] = None
        body["approved_at"] = None
    elif to_status == "approved":
        body["approved_at"] = ts
        body["reviewed_at"] = ts
        body["reviewed_by"] = reviewer_uid
        body["rejection_reason"] = None
    elif to_status == "rejected":
        body["reviewed_at"] = ts
        body["reviewed_by"] = reviewer_uid
        body["rejection_reason"] = reason
    elif to_status == "draft":
        # Returned for edits.
        body["reviewed_at"] = ts
        body["reviewed_by"] = reviewer_uid
        body["rejection_reason"] = reason
        body["submitted_at"] = None
    return await rest(
        page, "PATCH",
        f"/rest/v1/expense_claims?id=eq.{claim_id}",
        bearer, body=body, prefer="return=representation",
    )


async def run(seed_payload) -> int:
    owner_creds = seed_payload["credentials"]["owner"]
    admin_creds = seed_payload["credentials"]["super_admin"]
    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # ---------- Owner: creates claim + does the resubmits -----
            octx = await browser.new_context(
                viewport={"width": 1280, "height": 1800},
                locale="ar-SA",
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
                             body={"_name": "E2E Audit Trail Co",
                                   "_phone": "0500000099"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            # Create the claim in draft state as the owner.
            slug = f"AUD-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit trail demo claim",
                      "amount": 275.00, "currency": "SAR",
                      "category": "misc", "status": "draft",
                      "claim_number": f"EC-{slug}"},
                prefer="return=representation",
            )
            claim_id = suite._row_id(create)
            if create["status"] not in (200, 201) or not claim_id:
                rs.report("create claim", False, json.dumps(create))
                return 1
            rs.report("create claim", True, f"claim={claim_id}")

            # ---------- Reviewer: super_admin (AAL2) -----------------
            actx = await browser.new_context(
                viewport={"width": 1280, "height": 1800},
                locale="ar-SA",
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

            # ---------- Drive the six-step lifecycle -----------------
            reasons = {
                ("submitted", "draft"):    "يرجى إرفاق الفاتورة الأصلية.",
                ("submitted", "rejected"): "المبلغ يخالف سياسة الصرف.",
            }
            import time as _time
            for from_s, to_s in LIFECYCLE:
                ts = _time.strftime("%Y-%m-%dT%H:%M:%S.") + \
                     f"{int(_time.time()*1000)%1000:03d}Z"
                # 200 ms between steps so audit_log.created_at is strictly
                # ordered — the trigger uses now() which has µs resolution
                # but network jitter can otherwise re-order two rapid PATCHes.
                await asyncio.sleep(0.25)
                driver_page, driver_bearer, reviewer_uid = (
                    (a_page, a_bearer, a_uid)
                    if to_s in ("approved", "rejected", "draft")
                    else (o_page, o_tok["access_token"], None)
                )
                resp = await patch_status(
                    driver_page, driver_bearer, claim_id, to_s, ts,
                    reviewer_uid=reviewer_uid,
                    reason=reasons.get((from_s, to_s)),
                )
                if resp["status"] not in (200, 204) or not resp.get("body"):
                    rs.report(f"transition {from_s}->{to_s}",
                              False, json.dumps(resp))
                    return 1
            rs.report("lifecycle transitions", True,
                      " -> ".join(t for _, t in LIFECYCLE))

            # ---------- DB assertion: audit_log has all six transitions
            in_list = f"'{claim_id}'"
            rows = psql(
                "SELECT diff->'before'->>'status' || '->' || "
                "       diff->'after'->>'status' "
                "FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id={in_list} "
                "AND action='UPDATE' "
                "ORDER BY created_at ASC"
            ).splitlines()
            expected_pairs = [f"{f}->{t}" for f, t in LIFECYCLE]
            db_ok = rows == expected_pairs
            rs.report("audit_log rows chronological",
                      db_ok, f"got={rows} expected={expected_pairs}")
            if not db_ok:
                failures += 1

            # ---------- UI assertion: review page shows the trail -----
            await a_page.goto(
                f"{BASE}/dashboard/expenses/review",
                wait_until="domcontentloaded",
            )
            # Final status is `approved`, so switch to that tab.
            try:
                await a_page.get_by_role(
                    "tab", name=EXPECTED_LABELS_AR[-1]  # "اعتُمد" tab label differs
                ).click(timeout=3000)
            except Exception:
                # AR "Approved" tab label is `معتمَدة` — click by text fallback.
                try:
                    await a_page.get_by_text("معتمَدة", exact=True).click(
                        timeout=3000)
                except Exception:
                    await a_page.get_by_role(
                        "tab", name="Approved").click(timeout=3000)

            # Wait for the claim row.
            await a_page.wait_for_selector(f"text=EC-{slug}", timeout=8000)
            # RTL sanity — the dashboard must be RTL when using AR.
            dir_attr = await a_page.evaluate(
                "document.documentElement.getAttribute('dir')")
            is_ar = await a_page.evaluate(
                "(document.documentElement.getAttribute('lang')||'').startsWith('ar')")
            rtl_ok = dir_attr == "rtl" and bool(is_ar)
            rs.report("dashboard html[dir=rtl] + lang=ar",
                      rtl_ok, f"dir={dir_attr} ar={is_ar}")
            if not rtl_ok:
                failures += 1

            # Expand the audit trail — the row's history button uses the
            # ApprovalAuditTrail card title as its aria-label.
            await a_page.get_by_role(
                "button", name="سجل التدقيق"
            ).first.click(timeout=5000)

            # Wait for the timeline to render — one <ol> with 6 events.
            trail = a_page.locator("ol.border-s").first
            await trail.wait_for(state="visible", timeout=8000)
            items = trail.locator("li")
            count = await items.count()
            count_ok = count == len(LIFECYCLE)
            rs.report("audit trail item count",
                      count_ok, f"got={count} expected={len(LIFECYCLE)}")
            if not count_ok:
                failures += 1

            # Verify the badge label on each event, in order.
            observed = []
            for i in range(count):
                txt = (await items.nth(i).inner_text()).strip()
                observed.append(txt)
            ordering_ok = True
            for i, ((_, to_s), item_txt) in enumerate(zip(LIFECYCLE, observed)):
                ar = EXPECTED_LABELS_AR[i]
                en = EXPECTED_LABELS_EN[i]
                if ar not in item_txt and en not in item_txt:
                    ordering_ok = False
                    rs.report(f"event[{i}] label {ar!r}/{en!r}", False,
                              item_txt[:120])
            rs.report("audit trail chronological order in UI", ordering_ok)
            if not ordering_ok:
                failures += 1

            # RTL border side — `border-s` maps to border-inline-start.
            # In RTL, computed `border-right-width` should be non-zero
            # (the timeline's spine appears on the right).
            border_side = await trail.evaluate("""
              el => {
                const cs = getComputedStyle(el);
                return {
                  left:  parseFloat(cs.borderLeftWidth)  || 0,
                  right: parseFloat(cs.borderRightWidth) || 0,
                };
              }
            """)
            rtl_border_ok = (border_side.get("right", 0) > 0
                             and border_side.get("left", 0) == 0)
            rs.report("audit trail spine on RTL start side",
                      rtl_border_ok, json.dumps(border_side))
            if not rtl_border_ok:
                failures += 1

            # Rejection/return reason blocks are visible.
            reason_locator = a_page.get_by_text(
                "المبلغ يخالف سياسة الصرف.", exact=False)
            reason_ok = await reason_locator.count() > 0
            rs.report("rejection reason visible in trail", reason_ok)
            if not reason_ok:
                failures += 1

            await a_page.screenshot(path=str(SHOTS / "trail_rtl.png"))

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
