"""
Concurrent bulk-batch approval E2E:

Two admins race to approve the same submitted batch. Verifies that a
status-guarded PATCH (`?status=eq.submitted&id=eq.<batch>`) makes exactly
one PATCH win, so statuses never tear and audit_log never records a
duplicate submitted->approved transition.

Flow:
  1. Owner registers company, creates a batch with 3 claims, submits.
  2. Two independent admin sessions sign in and both elevate to AAL2 in
     parallel — separate browser contexts, separate bearer tokens.
  3. Both admins fire the guarded approve PATCH at the same instant via
     asyncio.gather() (batch + all claims in one shot each).
  4. Assertions:
       - exactly one admin sees rows updated (Prefer: return=representation
         returns the row for the winner and an empty [] for the loser).
       - final batch.status == 'approved'.
       - final claim counts: all approved, none stuck submitted/rejected.
       - reviewed_by matches ONE admin (the winner), not a mix.
       - audit_log has EXACTLY ONE submitted->approved row for the batch
         and EXACTLY n for the claims — the loser's PATCH matched zero
         rows so the trigger never fired for it.

Skips (exit 0) if TEST_SEED_TOKEN or PGHOST missing.

Run:  python3 tests/e2e/bulk-batch-concurrent-approval.spec.py
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
spec = importlib.util.spec_from_file_location(
    "receipt_scen", HERE / "receipt-approval-scenarios.spec.py"
)
rs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rs)  # type: ignore[union-attr]

# Reuse helpers from the unified suite
suite_spec = importlib.util.spec_from_file_location(
    "bulk_suite", HERE / "bulk-batch-suite.spec.py"
)
suite = importlib.util.module_from_spec(suite_spec)
suite_spec.loader.exec_module(suite)  # type: ignore[union-attr]

BASE = rs.BASE
SUPABASE_URL = rs.SUPABASE_URL
SUPABASE_KEY = rs.SUPABASE_KEY
SHOTS = Path("/tmp/browser/bulk-batch-concurrent-approval")
SHOTS.mkdir(parents=True, exist_ok=True)

psql = suite.psql
rest = suite.rest
create_batch = suite.create_batch
add_claims = suite.add_claims
submit_all = suite.submit_all
count_transitions = suite.count_transitions


async def open_admin(browser, creds):
    """Sign in + AAL2 elevate in an isolated browser context."""
    ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page = await ctx.new_page()
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    tok = await rs.sign_in(page, creds["email"], creds["password"])
    if not tok.get("ok"):
        return ctx, page, None, None, tok
    aal2 = await rs.elevate_aal2(page, tok["access_token"])
    bearer = aal2.get("access_token", tok["access_token"])
    return ctx, page, tok, bearer, None


async def guarded_approve(page, bearer, batch_id, admin_uid, ts, tag):
    """
    Approve batch+claims ONLY if the batch is still 'submitted'. Returns
    (tag, batch_response, claims_response) — response bodies for the
    loser are `[]` because the WHERE clause matched zero rows.
    """
    b = await rest(
        page, "PATCH",
        f"/rest/v1/expense_batches?id=eq.{batch_id}&status=eq.submitted",
        bearer,
        body={"status": "approved",
              "reviewed_at": ts, "reviewed_by": admin_uid},
        prefer="return=representation",
    )
    # Only the winner should touch claims; but simulate the race — both
    # admins fire the claims PATCH too. Guard on status=eq.submitted so the
    # loser again matches zero rows and no audit rows are emitted for it.
    c = await rest(
        page, "PATCH",
        f"/rest/v1/expense_claims?batch_id=eq.{batch_id}&status=eq.submitted",
        bearer,
        body={"status": "approved",
              "reviewed_at": ts, "reviewed_by": admin_uid,
              "approved_at": ts},
        prefer="return=representation",
    )
    return tag, b, c


def rows(resp):
    body = resp.get("body")
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        return [body]
    return []


async def run(seed_payload) -> int:
    owner_creds = seed_payload["credentials"]["owner"]
    admin_creds = seed_payload["credentials"]["super_admin"]
    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # === Owner: seed a submitted batch with 3 claims ===
            octx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            o_page = await octx.new_page()
            await o_page.goto(f"{BASE}/", wait_until="domcontentloaded")
            o_tok = await rs.sign_in(o_page, owner_creds["email"], owner_creds["password"])
            if not o_tok.get("ok"):
                rs.report("1. owner sign-in", False, json.dumps(o_tok))
                return 1
            rs.report("1. owner sign-in", True)

            reg = await rest(o_page, "POST", "/rest/v1/rpc/register_company",
                             o_tok["access_token"],
                             body={"_name": "E2E Concurrent Co",
                                   "_phone": "0500000044"})
            org_id = reg["body"].get("org_id") if reg.get("status") == 200 else None
            if not org_id:
                rs.report("2. register company", False, json.dumps(reg))
                return 1
            rs.report("2. register company", True, f"org={org_id}")

            specs = [{"amount": 130.0, "title": "Item A"},
                     {"amount": 245.0, "title": "Item B"},
                     {"amount":  70.0, "title": "Item C"}]
            _, batch_id = await create_batch(
                o_page, o_tok, org_id, "CCA",
                "E2E concurrent approval trip",
                "2026-07-30", "2026-08-01")
            if not batch_id:
                rs.report("3. create batch", False)
                return 1
            ids, err = await add_claims(o_page, o_tok, org_id, batch_id, "CCA", specs)
            if not ids:
                rs.report("4. add claims", False, str(err))
                return 1
            rs.report("4. add claims", True, f"count={len(ids)}")

            await submit_all(o_page, o_tok, batch_id, "2026-07-30T09:00:00Z")
            batch_status = psql(
                f"SELECT status FROM public.expense_batches WHERE id='{batch_id}'")
            if batch_status != "submitted":
                rs.report("5. submit batch", False, f"status={batch_status}")
                return 1
            rs.report("5. submit batch", True)
            await octx.close()

            # === Two admin sessions in parallel ===
            (c1, p1, t1, br1, e1), (c2, p2, t2, br2, e2) = await asyncio.gather(
                open_admin(browser, admin_creds),
                open_admin(browser, admin_creds),
            )
            if e1 or e2:
                rs.report("6. two admin sessions AAL2", False,
                          f"e1={e1} e2={e2}")
                return 1 + failures
            rs.report("6. two admin sessions AAL2", True,
                      f"uid1={t1['user_id']} uid2={t2['user_id']}")

            # === Both fire guarded approve at the same instant ===
            ts = "2026-07-30T15:00:00Z"
            (tag1, b1, cl1), (tag2, b2, cl2) = await asyncio.gather(
                guarded_approve(p1, br1, batch_id, t1["user_id"], ts, "A"),
                guarded_approve(p2, br2, batch_id, t2["user_id"], ts, "B"),
            )

            # --- Exactly one batch-level winner ---
            b1_rows = rows(b1)
            b2_rows = rows(b2)
            winners = [(tag, br) for tag, br in
                       (("A", b1_rows), ("B", b2_rows)) if len(br) == 1]
            losers  = [(tag, br) for tag, br in
                       (("A", b1_rows), ("B", b2_rows)) if len(br) == 0]
            ok7 = (len(winners) == 1 and len(losers) == 1
                   and b1["status"] in (200, 204) and b2["status"] in (200, 204))
            rs.report(
                "7. exactly one batch-level winner", ok7,
                f"A_rows={len(b1_rows)} B_rows={len(b2_rows)} "
                f"http={b1['status']}/{b2['status']}",
            )
            if not ok7:
                failures += 1

            # --- Final state consistent, no torn status ---
            row = psql(
                "SELECT status||'|'||coalesce(reviewed_by::text,'') "
                f"FROM public.expense_batches WHERE id='{batch_id}'"
            )
            b_status, b_reviewed_by = row.split("|", 1)
            n_appr = psql(
                "SELECT count(*) FROM public.expense_claims "
                f"WHERE batch_id='{batch_id}' AND status='approved'")
            n_stuck = psql(
                "SELECT count(*) FROM public.expense_claims "
                f"WHERE batch_id='{batch_id}' AND status<>'approved'")
            reviewer_matches = b_reviewed_by in (t1["user_id"], t2["user_id"])
            ok8 = (b_status == "approved" and n_appr == str(len(ids))
                   and n_stuck == "0" and reviewer_matches)
            rs.report(
                "8. final state consistent (no torn status)", ok8,
                f"batch={b_status} approved={n_appr}/{len(ids)} "
                f"stuck={n_stuck} reviewer_ok={reviewer_matches}",
            )
            if not ok8:
                failures += 1

            # --- All claims reviewed by the SAME admin ---
            n_by_winner = psql(
                "SELECT count(*) FROM public.expense_claims "
                f"WHERE batch_id='{batch_id}' "
                f"AND reviewed_by='{b_reviewed_by}'")
            n_by_other = psql(
                "SELECT count(*) FROM public.expense_claims "
                f"WHERE batch_id='{batch_id}' "
                f"AND reviewed_by<>'{b_reviewed_by}'")
            ok9 = n_by_winner == str(len(ids)) and n_by_other == "0"
            rs.report(
                "9. all claims reviewed by winning admin only", ok9,
                f"by_winner={n_by_winner} by_other={n_by_other}",
            )
            if not ok9:
                failures += 1

            # --- audit_log: exactly one transition per record, no duplicates ---
            b_appr = count_transitions("expense_batches", batch_id,
                                       "submitted", "approved")
            c_appr = count_transitions("expense_claims",  ids,
                                       "submitted", "approved")
            ok10 = b_appr == 1 and c_appr == len(ids)
            rs.report(
                "10. audit_log has no duplicate approval rows", ok10,
                f"batch_rows={b_appr} claim_rows={c_appr}/{len(ids)}",
            )
            if not ok10:
                failures += 1

            await p1.screenshot(path=str(SHOTS / "admin_A_after.png"))
            await p2.screenshot(path=str(SHOTS / "admin_B_after.png"))
            await c1.close()
            await c2.close()
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