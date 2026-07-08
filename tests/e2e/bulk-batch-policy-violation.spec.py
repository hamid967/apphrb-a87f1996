"""
Bulk-batch approval with a spending-policy violation E2E.

Scenario: an owner sets a meals policy of 75 SAR / claim (severity=block),
then submits a batch of three meal claims — two within cap (50, 60) and
one over cap (100). During the bulk-batch approval flow the reviewer:

  1. Sees a policy_violations alert on the over-cap claim (raised by the
     tg_check_spending_policy trigger on the INSERT that submitted it).
  2. Rejects that single claim with rejection_reason referencing the cap.
  3. Approves the batch as a whole — the two compliant claims flip to
     'approved', the offending claim stays 'rejected' with its reason,
     and the batch itself transitions submitted → approved.
  4. audit_log carries one POLICY_VIOLATION row plus the status flips.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:  python3 tests/e2e/bulk-batch-policy-violation.spec.py
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
SHOTS = Path("/tmp/browser/bulk-batch-policy-violation")
SHOTS.mkdir(parents=True, exist_ok=True)

CAP_SAR = 75.00


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


def _first(resp):
    body = resp.get("body")
    rows = body if isinstance(body, list) else [body]
    return rows[0] if rows and isinstance(rows[0], dict) else None


def report(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


async def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if not token: print("[SKIP] TEST_SEED_TOKEN not set"); return 0
    if not os.environ.get("PGHOST"): print("[SKIP] PGHOST not set"); return 0
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[SKIP] Supabase env missing"); return 0

    seeded = rs.seed(token)
    owner = seeded["credentials"]["owner"]
    owner_uid = owner["user_id"]

    # Grant the owner the app-level 'admin' role so they can PATCH batches/
    # claims through the "admins update any …" RLS policies (the batch write
    # policy scopes on has_role(app_role), not has_org_role).
    psql(f"""
      INSERT INTO user_roles (user_id, role)
      VALUES ('{owner_uid}', 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    """)

    passes = []
    pid = os.getpid()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")

        s = await rs.sign_in(page, owner["email"], owner["password"])
        if not s.get("ok"):
            print("[FAIL] owner sign-in", s); await browser.close(); return 1
        bearer = s["access_token"]
        passes.append(report("owner sign-in", True))

        # 1. Register company (owner becomes org member + org owner)
        reg = await rest(page, "POST", "/rest/v1/rpc/register_company", bearer,
                         body={"_name": "Meals Cap Co", "_phone": "0500000175"})
        org_id = (reg["body"] or {}).get("org_id")
        passes.append(report("register company", bool(org_id),
                             f"http={reg['status']}"))
        if not org_id:
            print(json.dumps(reg)); await browser.close(); return 1

        # 2. Create meals policy: max 75 SAR / claim, block
        pol = await rest(page, "POST", "/rest/v1/spending_policies", bearer,
                         body={"org_id": org_id, "category": "meals",
                               "max_amount": CAP_SAR, "currency": "SAR",
                               "rule_type": "max_amount", "severity": "block",
                               "active": True,
                               "note": "E2E meals cap 75 SAR/person"},
                         prefer="return=representation")
        policy_id = (_first(pol) or {}).get("id")
        passes.append(report("create meals policy (75/claim, block)",
                             pol["status"] in (200, 201) and bool(policy_id),
                             f"http={pol['status']}"))

        # 3. Create a batch (draft), then add three meal claims to it
        batch = await rest(page, "POST", "/rest/v1/expense_batches", bearer,
                           body={"org_id": org_id,
                                 "batch_number": f"E2E-POL-B-{pid}",
                                 "title": "Team meals — mixed compliance",
                                 "batch_type": "trip", "status": "draft",
                                 "total_amount": 210,
                                 "submitted_by": owner_uid},
                           prefer="return=representation")
        batch_id = (_first(batch) or {}).get("id")
        passes.append(report("create batch (draft)",
                             batch["status"] in (200, 201) and bool(batch_id),
                             f"http={batch['status']}"))

        specs = [
            ("compliant-a", 50.00, False),
            ("compliant-b", 60.00, False),
            ("over-cap",   100.00, True),
        ]
        claim_ids = {}
        for slug, amount, _over in specs:
            r = await rest(page, "POST", "/rest/v1/expense_claims", bearer,
                           body={"org_id": org_id, "submitted_by": owner_uid,
                                 "title": f"Meal {slug}",
                                 "description": f"Team meal ({slug})",
                                 "amount": amount, "currency": "SAR",
                                 "category": "meals", "status": "submitted",
                                 "batch_id": batch_id,
                                 "claim_number": f"EC-POL-{pid}-{slug}"},
                           prefer="return=representation")
            cid = (_first(r) or {}).get("id")
            passes.append(report(f"submit claim {slug} ({amount} SAR)",
                                 r["status"] in (200, 201) and bool(cid),
                                 f"http={r['status']}"))
            claim_ids[slug] = cid

        # Flip the batch to 'submitted' so it enters review lane
        r = await rest(page, "PATCH",
                       f"/rest/v1/expense_batches?id=eq.{batch_id}", bearer,
                       body={"status": "submitted",
                             "submitted_at": "2026-07-07T15:00:00Z"},
                       prefer="return=representation")
        passes.append(report("submit batch",
                             r["status"] in (200, 204),
                             f"http={r['status']}"))

        # 4. Trigger must have raised a policy_violations row on the over-cap
        #    claim ONLY.
        over_id = claim_ids["over-cap"]
        vrow_over = psql(
            "SELECT rule_type||'|'||severity||'|'||limit_amount||'|'||amount "
            f"FROM policy_violations WHERE claim_id='{over_id}'"
        )
        passes.append(report("violation raised on over-cap claim",
                             vrow_over == f"max_amount|block|{CAP_SAR:.2f}|100.00",
                             f"got={vrow_over!r}"))
        for slug in ("compliant-a", "compliant-b"):
            n = psql(
                f"SELECT count(*) FROM policy_violations "
                f"WHERE claim_id='{claim_ids[slug]}'"
            )
            passes.append(report(f"no violation on compliant claim ({slug})",
                                 n == "0", f"count={n}"))

        # 5. Violation is visible to org staff via REST (RLS: is_org_member)
        alerts = await rest(page, "GET",
            f"/rest/v1/policy_violations?claim_id=eq.{over_id}"
            "&select=id,rule_type,severity,reason,amount,limit_amount",
            bearer)
        first_alert = _first(alerts) or {}
        passes.append(report("violation visible via REST to org staff",
            alerts["status"] == 200 and first_alert.get("severity") == "block"
            and float(first_alert.get("limit_amount") or 0) == CAP_SAR,
            f"alert={first_alert}"))

        # 6. Reviewer rejects the offending claim with a cap-referencing reason
        reject_reason = (
            f"Exceeds meals policy cap of {CAP_SAR:.0f} SAR/claim "
            f"(claim amount 100.00 SAR)"
        )
        r = await rest(page, "PATCH",
            f"/rest/v1/expense_claims?id=eq.{over_id}", bearer,
            body={"status": "rejected",
                  "reviewed_at": "2026-07-07T15:05:00Z",
                  "reviewed_by": owner_uid,
                  "rejection_reason": reject_reason},
            prefer="return=representation")
        passes.append(report("reject over-cap claim",
                             r["status"] in (200, 204),
                             f"http={r['status']}"))

        # 7. Approve the remaining submitted claims + the batch (bulk step)
        r = await rest(page, "PATCH",
            f"/rest/v1/expense_claims?batch_id=eq.{batch_id}&status=eq.submitted",
            bearer,
            body={"status": "approved",
                  "reviewed_at": "2026-07-07T15:10:00Z",
                  "reviewed_by": owner_uid,
                  "approved_at": "2026-07-07T15:10:00Z"},
            prefer="return=representation")
        passes.append(report("bulk-approve remaining claims",
                             r["status"] in (200, 204),
                             f"http={r['status']}"))

        r = await rest(page, "PATCH",
            f"/rest/v1/expense_batches?id=eq.{batch_id}&status=eq.submitted",
            bearer,
            body={"status": "approved",
                  "reviewed_at": "2026-07-07T15:10:00Z",
                  "reviewed_by": owner_uid},
            prefer="return=representation")
        passes.append(report("approve batch",
                             r["status"] in (200, 204),
                             f"http={r['status']}"))

        # 8. Final status wiring — check every claim + batch state in DB
        final = psql(
            "SELECT id::text||'|'||status||'|'||"
            "COALESCE(rejection_reason,'') "
            f"FROM expense_claims WHERE batch_id='{batch_id}' ORDER BY amount"
        ).splitlines()
        state = {}
        for line in final:
            cid, status, reason = line.split("|", 2)
            state[cid] = (status, reason)
        ca, cb, co = (
            state[claim_ids["compliant-a"]],
            state[claim_ids["compliant-b"]],
            state[claim_ids["over-cap"]],
        )
        passes.append(report("compliant-a → approved, no rejection_reason",
                             ca == ("approved", ""), f"got={ca}"))
        passes.append(report("compliant-b → approved, no rejection_reason",
                             cb == ("approved", ""), f"got={cb}"))
        passes.append(report("over-cap → rejected with cap-referencing reason",
                             co[0] == "rejected"
                             and "meals policy cap" in co[1]
                             and "75" in co[1],
                             f"got={co}"))

        b_status = psql(f"SELECT status FROM expense_batches WHERE id='{batch_id}'")
        passes.append(report("batch → approved",
                             b_status == "approved", f"got={b_status!r}"))

        # 9. audit_log: one POLICY_VIOLATION for the over-cap claim, plus
        #    status flips for the compliant claims + batch.
        pv = psql(
            "SELECT count(*) FROM audit_log "
            f"WHERE entity='expense_claims' AND entity_id='{over_id}' "
            "AND action='POLICY_VIOLATION'"
        )
        # The tg_check_spending_policy trigger fires on BOTH INSERT (initial
        # submission) and UPDATE (reject PATCH re-evaluates), so we expect
        # exactly 2 POLICY_VIOLATION audit rows for the over-cap claim.
        passes.append(report("audit_log: 2 POLICY_VIOLATION on over-cap claim "
                             "(insert + reject re-eval)",
                             pv == "2", f"count={pv}"))

        pv_others = psql(
            "SELECT count(*) FROM audit_log "
            f"WHERE entity='expense_claims' AND action='POLICY_VIOLATION' "
            f"AND entity_id IN ('{claim_ids['compliant-a']}',"
            f"'{claim_ids['compliant-b']}')"
        )
        passes.append(report("no POLICY_VIOLATION on compliant claims",
                             pv_others == "0", f"count={pv_others}"))

        await page.screenshot(path=str(SHOTS / "final.png"))
        await browser.close()

    ok = all(passes)
    print(f"\n[{'OK' if ok else 'FAIL'}] {sum(passes)}/{len(passes)} assertions passed")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
