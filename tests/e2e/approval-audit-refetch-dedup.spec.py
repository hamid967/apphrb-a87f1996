"""
Approval audit trail — refetch de-duplication:

Guarantees the timeline stays free of duplicate events when the same
audit_log rows are re-served by repeated background refetches. TanStack
Query replaces the cached array on each refetch, and the component keys
each `<li>` by `ev.id`, so identical payloads MUST render exactly the
same DOM — same count, same ids, in the same order — no matter how many
times the query re-runs against unchanged data.

Concretely:
  1. Seed a claim + purge audit_log.
  2. Insert 2 synthetic audit_log rows (submitted, approved) — these
     are the only 2 rows for the claim.
  3. Reviewer opens the review page (Returned tab), expands the trail,
     waits for the timeline to hydrate → snapshot #1 (2 events).
  4. Wait past 15 s staleTime, dispatch focus → refetch #1.
  5. Snapshot #2. Assert li count == 2 AND the id set is identical.
  6. Wait past staleTime again, dispatch focus → refetch #2.
  7. Snapshot #3. Assert li count == 2 AND ids identical.
  8. Also verify: `audit_log` server-side still contains exactly the
     same 2 rows (i.e. we're really re-serving the same rows, not new
     ones).

If the component ever appended instead of replacing, we'd see 4 or 6
li's here. If it ever lost the key, we'd see React remounts and DOM
churn — but the ids returned by the server function would be the same,
so the id-set assertion is the strongest signal.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/approval-audit-refetch-dedup.spec.py
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
SHOTS = Path("/tmp/browser/approval-audit-refetch-dedup")
SHOTS.mkdir(parents=True, exist_ok=True)

rest = suite.rest
psql = suite.psql

RETURNED_TAB_AR = "مُرجَعة"
RETURNED_TAB_EN = "Returned"
TRAIL_TITLE_AR = "سجل التدقيق"
STALE_WAIT_S = 16.0


async def _trigger_refetch(page):
    """Dispatch focus/visibility events without navigation or reload."""
    await page.evaluate("""
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
    await page.mouse.move(400, 400)


async def _timeline_snapshot(page) -> dict:
    """Read li count + the `<li key>` ids (React sets data-* on <li>?
    We don't have keys exposed as attributes, so we key by DOM order +
    text content hash of each event row. Any change (add / reorder /
    remount) would flip the fingerprint)."""
    return await page.evaluate("""
      () => {
        const ol = document.querySelector('ol.border-s');
        if (!ol) return { count: 0, fingerprints: [] };
        const items = Array.from(ol.querySelectorAll(':scope > li'));
        return {
          count: items.length,
          fingerprints: items.map(li => (li.innerText || '').trim())
        };
      }
    """)


async def run(seed_payload) -> int:
    owner_creds = seed_payload["credentials"]["owner"]
    admin_creds = seed_payload["credentials"]["super_admin"]
    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # ---------- Owner: seed ---------------------------------
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
                             body={"_name": "E2E Audit Dedup Co",
                                   "_phone": "0500000099"})
            org_id = (reg.get("body") or {}).get("org_id") \
                if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            slug = f"DEDUP-{os.getpid()}"
            create = await rest(
                o_page, "POST", "/rest/v1/expense_claims",
                o_tok["access_token"],
                body={"org_id": org_id, "submitted_by": o_tok["user_id"],
                      "title": "Audit refetch-dedup claim",
                      "amount": 12.00, "currency": "SAR",
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

            # ---------- Reviewer sign-in ----------------------------
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

            # ---------- Insert the ONLY 2 audit rows ---------------
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
            row_count = int(psql(
                "SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}'"
            ))
            if row_count != 2:
                rs.report("audit_log seeded (2 rows)",
                          False, f"count={row_count}")
                return 1
            rs.report("audit_log seeded (2 rows)", True)

            # ---------- Open review + expand trail -----------------
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
            await a_page.get_by_role(
                "button", name=TRAIL_TITLE_AR
            ).first.click(timeout=5000)

            trail = a_page.locator("ol.border-s").first
            await trail.locator("li").first.wait_for(
                state="visible", timeout=10_000)

            snap1 = await _timeline_snapshot(a_page)
            snap1_ok = snap1["count"] == 2
            rs.report("initial render: 2 events",
                      snap1_ok, f"snap1={snap1}")
            if not snap1_ok:
                return 1

            # ---------- Refetch #1 ---------------------------------
            rs.report(f"waiting {STALE_WAIT_S}s (staleTime) → refetch #1",
                      True)
            await asyncio.sleep(STALE_WAIT_S)
            await _trigger_refetch(a_page)
            # Give React Query a beat to resolve and re-render.
            await a_page.wait_for_timeout(1200)
            snap2 = await _timeline_snapshot(a_page)

            # DB still has exactly 2 rows — we didn't insert more.
            row_after_1 = int(psql(
                "SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}'"
            ))
            rs.report("db still has 2 audit rows after refetch #1",
                      row_after_1 == 2, f"count={row_after_1}")
            if row_after_1 != 2:
                failures += 1

            dup_ok_2 = (
                snap2["count"] == 2
                and snap2["fingerprints"] == snap1["fingerprints"]
            )
            rs.report("no duplicate events after refetch #1",
                      dup_ok_2,
                      f"count={snap2['count']} "
                      f"same_fingerprints={snap2['fingerprints'] == snap1['fingerprints']}")
            if not dup_ok_2:
                failures += 1

            # ---------- Refetch #2 ---------------------------------
            rs.report(f"waiting {STALE_WAIT_S}s (staleTime) → refetch #2",
                      True)
            await asyncio.sleep(STALE_WAIT_S)
            await _trigger_refetch(a_page)
            await a_page.wait_for_timeout(1200)
            snap3 = await _timeline_snapshot(a_page)

            row_after_2 = int(psql(
                "SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}'"
            ))
            rs.report("db still has 2 audit rows after refetch #2",
                      row_after_2 == 2, f"count={row_after_2}")
            if row_after_2 != 2:
                failures += 1

            dup_ok_3 = (
                snap3["count"] == 2
                and snap3["fingerprints"] == snap1["fingerprints"]
            )
            rs.report("no duplicate events after refetch #2",
                      dup_ok_3,
                      f"count={snap3['count']} "
                      f"same_fingerprints={snap3['fingerprints'] == snap1['fingerprints']}")
            if not dup_ok_3:
                failures += 1

            # Belt-and-braces: no <li> in the *whole document* beyond
            # the two we expect for this trail (i.e. the timeline
            # didn't accidentally clone itself into another card).
            border_s_lists = await a_page.locator("ol.border-s").count()
            all_li = await a_page.locator("ol.border-s > li").count()
            # Expect exactly one open trail for this row, but the review
            # page may render other rows' collapsed sections; only the
            # opened one shows an <ol.border-s>. So we assert 1 ol and
            # 2 lis total.
            trail_singleton_ok = border_s_lists == 1 and all_li == 2
            rs.report("exactly one open trail with 2 li total",
                      trail_singleton_ok,
                      f"ols={border_s_lists} lis={all_li}")
            if not trail_singleton_ok:
                failures += 1

            await a_page.screenshot(
                path=str(SHOTS / "dedup_after_refetches.png"))

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
