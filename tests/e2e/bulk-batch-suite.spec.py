"""
Unified bulk-batch approval E2E suite (parametrized).

Consolidates the following legacy specs into a single run that seeds once,
opens a single browser, and reuses one owner + one admin session across all
scenarios — cutting CI time roughly 5× versus running each spec separately:

  - bulk-batch-approval.spec.py           → scenario "approval"
  - bulk-batch-rejection-audit.spec.py    → scenario "rejection"
  - bulk-batch-partial-rejection.spec.py  → scenario "partial"
  - bulk-batch-reopen-audit.spec.py       → scenario "reopen"
  - bulk-batch-resubmit-approve.spec.py   → scenario "resubmit_approve"

Every scenario creates its own expense_batch (unique batch_number + claim
numbers keyed on pid + scenario slug) under the same shared org, so each
run is fully isolated at the batch level and audit_log rows never collide.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Env:
  BULK_BATCH_SCENARIOS   comma-separated subset to run (default: all)
                         e.g. BULK_BATCH_SCENARIOS=approval,reopen

Run:
  python3 tests/e2e/bulk-batch-suite.spec.py
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

BASE = rs.BASE
SUPABASE_URL = rs.SUPABASE_URL
SUPABASE_KEY = rs.SUPABASE_KEY
SHOTS = Path("/tmp/browser/bulk-batch-suite")
SHOTS.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------
# Shared low-level helpers
# --------------------------------------------------------------------------

def psql(sql: str) -> str:
    return subprocess.check_output(["psql", "-Atc", sql], text=True).strip()


async def rest(page, method, path, bearer, body=None, prefer=None):
    return await page.evaluate(
        """async ({ url, key, bearer, method, path, body, prefer }) => {
          const headers = { 'Content-Type': 'application/json', apikey: key,
                            Authorization: 'Bearer ' + bearer };
          if (prefer) headers['Prefer'] = prefer;
          const init = { method, headers };
          if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
            init.body = JSON.stringify(body);
          }
          const r = await fetch(url + path, init);
          let out; try { out = await r.json(); } catch { out = null; }
          return { status: r.status, body: out };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": bearer,
         "method": method, "path": path, "body": body, "prefer": prefer},
    )


def _row_id(resp):
    body = resp.get("body")
    rows = body if isinstance(body, list) else [body]
    if rows and isinstance(rows[0], dict):
        return rows[0].get("id")
    return None


async def create_batch(page, tok, org_id, slug, title, start=None, end=None):
    body = {"org_id": org_id, "submitted_by": tok["user_id"],
            "batch_number": f"TRP-{slug}-{os.getpid()}",
            "title": title, "batch_type": "trip", "status": "draft",
            "currency": "SAR"}
    if start: body["start_date"] = start
    if end:   body["end_date"] = end
    resp = await rest(page, "POST", "/rest/v1/expense_batches",
                      tok["access_token"], body=body,
                      prefer="return=representation")
    return resp, _row_id(resp)


async def add_claims(page, tok, org_id, batch_id, slug, specs):
    """specs: list of dicts {amount, title, category}. Returns list of ids."""
    ids = []
    for i, s in enumerate(specs):
        resp = await rest(
            page, "POST", "/rest/v1/expense_claims", tok["access_token"],
            body={"org_id": org_id, "submitted_by": tok["user_id"],
                  "batch_id": batch_id,
                  "title": s["title"], "amount": s["amount"], "currency": "SAR",
                  "category": s.get("category", "misc"), "status": "draft",
                  "claim_number": f"EC-{slug}-{os.getpid()}-{i+1}"},
            prefer="return=representation",
        )
        cid = _row_id(resp)
        if resp["status"] not in (200, 201) or not cid:
            return None, resp
        ids.append(cid)
    return ids, None


async def submit_all(page, tok, batch_id, ts):
    b = await rest(page, "PATCH",
                   f"/rest/v1/expense_batches?id=eq.{batch_id}",
                   tok["access_token"],
                   body={"status": "submitted", "submitted_at": ts},
                   prefer="return=representation")
    c = await rest(page, "PATCH",
                   f"/rest/v1/expense_claims?batch_id=eq.{batch_id}",
                   tok["access_token"],
                   body={"status": "submitted", "submitted_at": ts},
                   prefer="return=representation")
    return b, c


def count_transitions(entity, ids, before, after):
    if isinstance(ids, str):
        cond = f"entity_id='{ids}'"
    else:
        in_list = ",".join("'" + c + "'" for c in ids)
        cond = f"entity_id IN ({in_list})"
    return int(psql(
        "SELECT count(*) FROM public.audit_log "
        f"WHERE entity='{entity}' AND {cond} "
        f"AND action='UPDATE' "
        f"AND diff->'before'->>'status'='{before}' "
        f"AND diff->'after'->>'status'='{after}'"
    ))


# --------------------------------------------------------------------------
# Scenarios (each returns (name, ok, detail))
# --------------------------------------------------------------------------

async def scenario_approval(owner, admin, org_id):
    o_page, o_tok = owner
    a_page, a_bearer, a_uid = admin
    slug = "APR"
    specs = [{"amount": 120.5, "title": "Taxi",  "category": "transport"},
             {"amount": 340.0, "title": "Hotel", "category": "lodging"},
             {"amount":  89.75,"title": "Dinner","category": "meals"}]
    _, batch_id = await create_batch(o_page, o_tok, org_id, slug,
                                     "E2E Riyadh trip",
                                     "2026-07-01", "2026-07-05")
    if not batch_id: return "approval", False, "create batch failed"
    ids, err = await add_claims(o_page, o_tok, org_id, batch_id, slug, specs)
    if not ids: return "approval", False, f"claims: {err}"
    await submit_all(o_page, o_tok, batch_id, "2026-07-07T12:00:00Z")

    expected_total = round(sum(s["amount"] for s in specs), 2)
    trg_total = float(psql(
        f"SELECT total_amount::text FROM public.expense_batches WHERE id='{batch_id}'"
    ))
    if abs(trg_total - expected_total) > 0.01:
        return "approval", False, f"total_amount={trg_total} expected={expected_total}"

    # Approve
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"status": "approved",
                     "reviewed_at": "2026-07-07T13:00:00Z",
                     "reviewed_by": a_uid})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", a_bearer,
               body={"status": "approved",
                     "approved_at": "2026-07-07T13:00:00Z",
                     "reviewed_at": "2026-07-07T13:00:00Z",
                     "reviewed_by": a_uid})
    batch_final = psql(f"SELECT status FROM public.expense_batches WHERE id='{batch_id}'")
    n_appr = psql("SELECT count(*) FROM public.expense_claims "
                  f"WHERE batch_id='{batch_id}' AND status='approved'")
    # Audit: expect exactly one submitted->approved transition per entity —
    # any duplicate row from a repeat PATCH would push these above the target.
    b_appr = count_transitions("expense_batches", batch_id, "submitted", "approved")
    c_appr = count_transitions("expense_claims",  ids,       "submitted", "approved")
    b_sub  = count_transitions("expense_batches", batch_id, "draft",     "submitted")
    c_sub  = count_transitions("expense_claims",  ids,       "draft",     "submitted")
    n = len(ids)
    ok = (batch_final == "approved" and n_appr == str(n)
          and b_sub == 1 and b_appr == 1
          and c_sub == n and c_appr == n)
    return "approval", ok, (
        f"batch={batch_final} appr={n_appr}/{n} "
        f"audit b_sub/appr={b_sub}/{b_appr} c_sub/appr={c_sub}/{c_appr}"
    )


async def scenario_rejection(owner, admin, org_id):
    o_page, o_tok = owner
    a_page, a_bearer, a_uid = admin
    slug = "RJT"
    specs = [{"amount": 180.0, "title": "Taxi"},
             {"amount": 260.5, "title": "Hotel"},
             {"amount":  90.25,"title": "Dinner"}]
    _, batch_id = await create_batch(o_page, o_tok, org_id, slug,
                                     "E2E Jeddah trip (reject)")
    ids, err = await add_claims(o_page, o_tok, org_id, batch_id, slug, specs)
    if not ids: return "rejection", False, f"claims: {err}"
    await submit_all(o_page, o_tok, batch_id, "2026-07-10T09:00:00Z")

    reason = "Duplicate expenses; please resubmit."
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-10T15:00:00Z",
                     "reviewed_by": a_uid, "rejection_reason": reason})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-10T15:00:00Z",
                     "reviewed_by": a_uid, "rejection_reason": reason})

    batch_final = psql(f"SELECT status FROM public.expense_batches WHERE id='{batch_id}'")
    n_rej = psql("SELECT count(*) FROM public.expense_claims "
                 f"WHERE batch_id='{batch_id}' AND status='rejected'")
    n_appr = psql("SELECT count(*) FROM public.expense_claims "
                  f"WHERE batch_id='{batch_id}' AND status='approved'")
    # Exact-count audit: one submitted->rejected transition per record.
    # A repeated PATCH from a buggy retry would push these above target.
    n = len(ids)
    b_rej = count_transitions("expense_batches", batch_id, "submitted", "rejected")
    c_rej = count_transitions("expense_claims",  ids,       "submitted", "rejected")
    ok = (batch_final == "rejected" and n_rej == str(n) and n_appr == "0"
          and b_rej == 1 and c_rej == n)
    return "rejection", ok, (f"batch={batch_final} rej={n_rej} appr={n_appr} "
                             f"audit b_rej={b_rej} c_rej={c_rej}/{n}")


async def scenario_partial(owner, admin, org_id):
    o_page, o_tok = owner
    a_page, a_bearer, a_uid = admin
    slug = "PRT"
    specs = [{"amount": 220.0, "title": "Taxi"},
             {"amount": 340.0, "title": "Hotel"},
             {"amount":  75.0, "title": "Coffee"}]
    _, batch_id = await create_batch(o_page, o_tok, org_id, slug,
                                     "E2E Riyadh trip (partial)")
    ids, err = await add_claims(o_page, o_tok, org_id, batch_id, slug, specs)
    if not ids: return "partial", False, f"claims: {err}"
    await submit_all(o_page, o_tok, batch_id, "2026-07-15T09:00:00Z")

    rejected_id = ids[0]
    kept_ids = ids[1:]
    reason = "Duplicate taxi receipt; others under review."

    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?id=eq.{rejected_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-15T15:00:00Z",
                     "reviewed_by": a_uid, "rejection_reason": reason})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"reviewed_at": "2026-07-15T15:00:00Z",
                     "reviewed_by": a_uid,
                     "rejection_reason": "Partial: 1 claim rejected, 2 pending."})

    b_row = psql(
        "SELECT status||'|'||(reviewed_at IS NOT NULL)::text||'|'"
        "||coalesce(rejection_reason,'') "
        f"FROM public.expense_batches WHERE id='{batch_id}'")
    b_status, b_reviewed, b_reason = b_row.split("|", 2)
    n_rej = psql("SELECT count(*) FROM public.expense_claims "
                 f"WHERE batch_id='{batch_id}' AND status='rejected'")
    n_sub = psql("SELECT count(*) FROM public.expense_claims "
                 f"WHERE batch_id='{batch_id}' AND status='submitted'")
    kept_list = ",".join("'" + c + "'" for c in kept_ids)
    kept_wrong = int(psql(
        "SELECT count(*) FROM public.audit_log "
        f"WHERE entity='expense_claims' AND entity_id IN ({kept_list}) "
        "AND action='UPDATE' AND diff->'after'->>'status'='rejected'"))
    # Exact-count audit: batch UPDATE without status change still emits ONE
    # row (reviewed_at flipped); the rejected claim emits ONE row; kept
    # claims emit ZERO status-flip rows.
    b_touch = int(psql(
        "SELECT count(*) FROM public.audit_log "
        f"WHERE entity='expense_batches' AND entity_id='{batch_id}' "
        "AND action='UPDATE' "
        "AND diff->'after'->>'reviewed_at' IS NOT NULL"))
    rejected_audit = count_transitions(
        "expense_claims", rejected_id, "submitted", "rejected")
    ok = (b_status == "submitted" and b_reviewed == "true"
          and "Partial" in b_reason and n_rej == "1"
          and n_sub == str(len(kept_ids))
          and b_touch == 1 and rejected_audit == 1 and kept_wrong == 0)
    return "partial", ok, (f"batch={b_status} rej={n_rej} sub={n_sub} "
                           f"audit b_touch={b_touch} rejected={rejected_audit} "
                           f"kept_wrongly={kept_wrong}")


async def scenario_reopen(owner, admin, org_id):
    o_page, o_tok = owner
    a_page, a_bearer, a_uid = admin
    slug = "ROP"
    specs = [{"amount": 150.0, "title": "Item 1"},
             {"amount": 275.0, "title": "Item 2"},
             {"amount":  60.0, "title": "Item 3"}]
    _, batch_id = await create_batch(o_page, o_tok, org_id, slug,
                                     "E2E Dammam trip (reopen)",
                                     "2026-07-20", "2026-07-22")
    ids, err = await add_claims(o_page, o_tok, org_id, batch_id, slug, specs)
    if not ids: return "reopen", False, f"claims: {err}"
    await submit_all(o_page, o_tok, batch_id, "2026-07-20T09:00:00Z")

    # Reject
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-20T15:00:00Z",
                     "reviewed_by": a_uid,
                     "rejection_reason": "Missing receipts."})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-20T15:00:00Z",
                     "reviewed_by": a_uid,
                     "rejection_reason": "Missing receipts."})
    # Reopen
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"status": "draft", "reviewed_at": None,
                     "reviewed_by": None, "rejection_reason": None,
                     "submitted_at": None})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", a_bearer,
               body={"status": "draft", "reviewed_at": None,
                     "reviewed_by": None, "rejection_reason": None,
                     "submitted_at": None})

    b_row = psql(
        "SELECT status||'|'||coalesce(rejection_reason,'')||'|'"
        "||(reviewed_at IS NULL)::text "
        f"FROM public.expense_batches WHERE id='{batch_id}'")
    b_status, b_reason, b_rev_null = b_row.split("|", 2)
    n_draft = psql(
        "SELECT count(*) FROM public.expense_claims "
        f"WHERE batch_id='{batch_id}' AND status='draft' "
        "AND rejection_reason IS NULL AND reviewed_at IS NULL")

    b_rej = count_transitions("expense_batches", batch_id, "submitted", "rejected")
    b_rop = count_transitions("expense_batches", batch_id, "rejected", "draft")
    c_rej = count_transitions("expense_claims",  ids,       "submitted", "rejected")
    c_rop = count_transitions("expense_claims",  ids,       "rejected",  "draft")

    n = len(ids)
    ok = (b_status == "draft" and b_reason == "" and b_rev_null == "true"
          and n_draft == str(n)
          # Exact counts detect duplicate audit rows from a repeated PATCH.
          and b_rej == 1 and b_rop == 1
          and c_rej == n and c_rop == n)
    return "reopen", ok, (f"batch={b_status} draft_claims={n_draft} "
                          f"audit b_rej={b_rej} b_rop={b_rop} "
                          f"c_rej={c_rej}/{n} c_rop={c_rop}/{n}")


async def scenario_resubmit_approve(owner, admin, org_id):
    o_page, o_tok = owner
    a_page, a_bearer, a_uid = admin
    slug = "RSB"
    specs = [{"amount": 120.0, "title": "Item 1"},
             {"amount": 210.0, "title": "Item 2"},
             {"amount":  55.0, "title": "Item 3"}]
    _, batch_id = await create_batch(o_page, o_tok, org_id, slug,
                                     "E2E Makkah trip (resubmit)")
    ids, err = await add_claims(o_page, o_tok, org_id, batch_id, slug, specs)
    if not ids: return "resubmit_approve", False, f"claims: {err}"
    await submit_all(o_page, o_tok, batch_id, "2026-07-25T09:00:00Z")

    # Reject
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-25T15:00:00Z",
                     "reviewed_by": a_uid,
                     "rejection_reason": "Amounts look wrong."})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", a_bearer,
               body={"status": "rejected",
                     "reviewed_at": "2026-07-25T15:00:00Z",
                     "reviewed_by": a_uid,
                     "rejection_reason": "Amounts look wrong."})
    # Owner reopens + edits + resubmits (reuses owner session)
    await rest(o_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", o_tok["access_token"],
               body={"status": "draft", "reviewed_at": None,
                     "reviewed_by": None, "rejection_reason": None,
                     "submitted_at": None})
    await rest(o_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", o_tok["access_token"],
               body={"status": "draft", "reviewed_at": None,
                     "reviewed_by": None, "rejection_reason": None,
                     "submitted_at": None})
    for cid, s in zip(ids, specs):
        await rest(o_page, "PATCH",
                   f"/rest/v1/expense_claims?id=eq.{cid}", o_tok["access_token"],
                   body={"amount": round(s["amount"] + 10, 2)})
    await submit_all(o_page, o_tok, batch_id, "2026-07-25T18:00:00Z")

    # Approve
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_batches?id=eq.{batch_id}", a_bearer,
               body={"status": "approved",
                     "reviewed_at": "2026-07-25T20:00:00Z",
                     "reviewed_by": a_uid})
    await rest(a_page, "PATCH",
               f"/rest/v1/expense_claims?batch_id=eq.{batch_id}", a_bearer,
               body={"status": "approved",
                     "reviewed_at": "2026-07-25T20:00:00Z",
                     "reviewed_by": a_uid,
                     "approved_at": "2026-07-25T20:00:00Z"})

    b_final = psql(f"SELECT status FROM public.expense_batches WHERE id='{batch_id}'")
    n_appr = psql("SELECT count(*) FROM public.expense_claims "
                  f"WHERE batch_id='{batch_id}' AND status='approved'")
    b_reject = count_transitions("expense_batches", batch_id, "submitted", "rejected")
    b_resub  = count_transitions("expense_batches", batch_id, "draft",     "submitted")
    b_appr   = count_transitions("expense_batches", batch_id, "submitted", "approved")
    c_reject = count_transitions("expense_claims",  ids,       "submitted", "rejected")
    c_resub  = count_transitions("expense_claims",  ids,       "draft",     "submitted")
    c_appr   = count_transitions("expense_claims",  ids,       "submitted", "approved")
    n = len(ids)
    # draft->submitted happens twice (initial submit + resubmit after reopen)
    ok = (b_final == "approved" and n_appr == str(n)
          and b_reject == 1 and b_resub == 2 and b_appr == 1
          and c_reject == n and c_resub == 2 * n and c_appr == n)
    return "resubmit_approve", ok, (
        f"batch={b_final} appr={n_appr}/{n} "
        f"b={b_reject}/{b_resub}/{b_appr} c={c_reject}/{c_resub}/{c_appr}"
    )


SCENARIOS = {
    "approval":          scenario_approval,
    "rejection":         scenario_rejection,
    "partial":           scenario_partial,
    "reopen":            scenario_reopen,
    "resubmit_approve":  scenario_resubmit_approve,
}


# --------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------

async def run(seed_payload) -> int:
    owner_creds = seed_payload["credentials"]["owner"]
    admin_creds = seed_payload["credentials"]["super_admin"]

    selected = os.environ.get("BULK_BATCH_SCENARIOS", "").strip()
    names = [n.strip() for n in selected.split(",") if n.strip()] if selected \
            else list(SCENARIOS.keys())
    unknown = [n for n in names if n not in SCENARIOS]
    if unknown:
        print(f"[fail] unknown scenarios: {unknown}", file=sys.stderr)
        return 1

    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # --- Owner session (shared across scenarios) ---
            octx = await browser.new_context(viewport={"width": 1280, "height": 1800})
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
                             body={"_name": "E2E Bulk Suite Co",
                                   "_phone": "0500000055"})
            org_id = reg["body"].get("org_id") if reg.get("status") == 200 else None
            if not org_id:
                rs.report("register company", False, json.dumps(reg))
                return 1
            rs.report("register company", True, f"org={org_id}")

            # --- Admin session (AAL2, shared across scenarios) ---
            actx = await browser.new_context(viewport={"width": 1280, "height": 1800})
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

            owner_env = (o_page, o_tok)
            admin_env = (a_page, a_bearer, a_uid)

            # --- Run scenarios sequentially in the same browser ---
            for name in names:
                try:
                    scen_name, ok, detail = await SCENARIOS[name](
                        owner_env, admin_env, org_id)
                except Exception as e:
                    rs.report(f"scenario:{name}", False, f"exception: {e!r}")
                    failures += 1
                    continue
                rs.report(f"scenario:{scen_name}", ok, detail)
                if not ok:
                    failures += 1
                    try:
                        await a_page.screenshot(
                            path=str(SHOTS / f"fail_{scen_name}.png"))
                    except Exception:
                        pass

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