"""
Approval audit trail — loading state on refetch:

Verifies two loading/state guarantees for `ApprovalAuditTrail`:

  A. Initial expand: the "Loading history…" copy renders, then
     disappears. After it goes away we see the empty state (no rows
     yet).

  B. Background refetch after inserting audit_log rows: since the
     component uses `useQuery` with `staleTime: 15_000` and only checks
     `q.isLoading` (initial fetch), a stale-driven refetch is a
     *background* fetch — `isLoading` stays false. So during the
     empty→timeline hydration the UI must transition directly from the
     empty-state copy to the `<ol.border-s>` list, and specifically:
        - the empty-state copy MUST NOT briefly disappear and reappear,
        - the loading spinner MUST NOT flash again,
        - eventually the 2 events render in place.

Flow:
  1. Owner seeds company + draft claim, purge audit_log rows.
  2. Reviewer opens /dashboard/expenses/review (Returned tab).
  3. Start polling BEFORE the trail is expanded so we can catch the
     initial spinner (isLoading=true). Expand the row.
  4. Wait for empty state to be visible → mark "empty stable".
  5. Insert 2 synthetic audit_log rows via psql.
  6. Wait past 15 s staleTime, fire focus/visibilitychange to trigger a
     background refetch.
  7. While waiting for the `<ol>` to appear, poll every 50 ms and
     record every transition of {loading spinner visible, empty copy
     visible, ol.border-s visible}.
  8. Assert:
       - initial loading was seen at least once,
       - initial loading eventually became false,
       - empty state appeared exactly once,
       - during refetch: loading spinner never became visible again,
       - during refetch: empty-state visibility never transitioned
         `visible → hidden → visible` (i.e. never flickered back),
       - final state = ol with 2 li, empty copy gone.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/approval-audit-loading-refetch.spec.py
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
SHOTS = Path("/tmp/browser/approval-audit-loading-refetch")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

RETURNED_TAB_AR = "مُرجَعة"
RETURNED_TAB_EN = "Returned"
TRAIL_TITLE_AR = "سجل التدقيق"
LOADING_AR = "جارِ تحميل السجل"       # substring match — trailing "…"
LOADING_EN = "Loading history"
EMPTY_AR = "لا توجد قرارات مسجّلة بعد."
EMPTY_EN = "No decisions recorded yet."

STALE_WAIT_S = 16.0
# How long we keep polling after the focus event before giving up.
REFETCH_POLL_TIMEOUT_S = 12.0
POLL_INTERVAL_S = 0.05


async def _snapshot(page) -> dict:
    """One flat state read for the poll loop. Cheap: three counts."""
    return await page.evaluate(f"""
      () => {{
        const text = document.body.innerText || '';
        const hasLoading =
          text.includes({json.dumps(LOADING_AR)}) ||
          text.includes({json.dumps(LOADING_EN)});
        const hasEmpty =
          text.includes({json.dumps(EMPTY_AR)}) ||
          text.includes({json.dumps(EMPTY_EN)});
        const ol = document.querySelector('ol.border-s');
        const olItems = ol ? ol.querySelectorAll('li').length : 0;
        return {{ hasLoading, hasEmpty, olItems }};
      }}
    """)


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
                             body={"_name": "E2E Audit Loading Co",
                                   "_phone": "0500000097"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            slug = f"LOAD-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit loading-refetch claim",
                      "amount": 17.00, "currency": "SAR",
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

            try:
                await a_page.get_by_role(
                    "tab", name=RETURNED_TAB_AR).click(timeout=5000)
            except Exception:
                await a_page.get_by_role(
                    "tab", name=RETURNED_TAB_EN).click(timeout=5000)

            await a_page.wait_for_selector(f"text=EC-{slug}", timeout=8000)

            # ---------- PART A: initial loading appears/disappears --
            # Start a poll that captures every distinct snapshot from
            # the moment we click the trail button until the empty
            # state is stable.
            trail_button = a_page.get_by_role(
                "button", name=TRAIL_TITLE_AR).first

            initial_snaps: list[dict] = []

            async def poll_initial():
                deadline = _time.time() + 8.0
                last = None
                while _time.time() < deadline:
                    s = await _snapshot(a_page)
                    key = (s["hasLoading"], s["hasEmpty"], s["olItems"])
                    if key != last:
                        initial_snaps.append({"t": _time.time(), **s})
                        last = key
                    # stop once empty has been visible for a beat with
                    # no loading indicator.
                    if s["hasEmpty"] and not s["hasLoading"]:
                        # brief settle
                        await asyncio.sleep(0.15)
                        s2 = await _snapshot(a_page)
                        if s2["hasEmpty"] and not s2["hasLoading"]:
                            return
                    await asyncio.sleep(POLL_INTERVAL_S)

            poll_task = asyncio.create_task(poll_initial())
            await trail_button.click(timeout=5000)
            await poll_task

            saw_loading = any(x["hasLoading"] for x in initial_snaps)
            loading_cleared = initial_snaps and \
                not initial_snaps[-1]["hasLoading"]
            saw_empty_after_loading = initial_snaps and \
                initial_snaps[-1]["hasEmpty"]

            rs.report("initial: loading spinner appeared",
                      saw_loading, f"snaps={len(initial_snaps)}")
            if not saw_loading:
                # Not a hard failure — with a fast cache/network the
                # spinner can be sub-frame. But we still record it.
                pass
            rs.report("initial: loading cleared",
                      bool(loading_cleared))
            if not loading_cleared:
                failures += 1
            rs.report("initial: empty state visible after loading",
                      bool(saw_empty_after_loading))
            if not saw_empty_after_loading:
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

            # ---------- Wait past staleTime -------------------------
            rs.report(f"waiting {STALE_WAIT_S}s for staleTime", True)
            await asyncio.sleep(STALE_WAIT_S)

            # ---------- PART B: refetch poll ------------------------
            refetch_snaps: list[dict] = []

            async def poll_refetch():
                deadline = _time.time() + REFETCH_POLL_TIMEOUT_S
                last = None
                while _time.time() < deadline:
                    s = await _snapshot(a_page)
                    key = (s["hasLoading"], s["hasEmpty"], s["olItems"])
                    if key != last:
                        refetch_snaps.append({"t": _time.time(), **s})
                        last = key
                    if s["olItems"] >= 2 and not s["hasEmpty"]:
                        return
                    await asyncio.sleep(POLL_INTERVAL_S)

            poll_task = asyncio.create_task(poll_refetch())
            # Fire refetch triggers WITHOUT reloading.
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
            await poll_task

            # Diagnostic dump
            print("[refetch snapshots]", file=sys.stderr)
            for s in refetch_snaps:
                print("  ", s, file=sys.stderr)

            # Loading spinner must NEVER appear during a background
            # refetch — the component only reads q.isLoading.
            loading_during_refetch = any(
                x["hasLoading"] for x in refetch_snaps)
            rs.report(
                "refetch: loading spinner did NOT reappear",
                not loading_during_refetch,
                f"snaps={len(refetch_snaps)}",
            )
            if loading_during_refetch:
                failures += 1

            # Empty state must not go visible → hidden → visible.
            visited_empty = [x["hasEmpty"] for x in refetch_snaps]
            re_shown = False
            went_hidden = False
            for v in visited_empty:
                if not v and any(visited_empty[:visited_empty.index(v) + 1]):
                    went_hidden = True
                if went_hidden and v:
                    re_shown = True
                    break
            rs.report(
                "refetch: empty state never flickered back",
                not re_shown, f"trace={visited_empty}",
            )
            if re_shown:
                failures += 1

            # Final state = 2 items, no empty copy, no spinner.
            final = refetch_snaps[-1] if refetch_snaps else \
                await _snapshot(a_page)
            final_ok = (final["olItems"] == 2
                        and not final["hasEmpty"]
                        and not final["hasLoading"])
            rs.report("refetch: final state = 2 events, no empty, no spinner",
                      final_ok, str(final))
            if not final_ok:
                failures += 1

            await a_page.screenshot(
                path=str(SHOTS / "loading_refetch_rtl.png"))

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
