"""
Spending policy engine E2E:

  1. Owner signs in + registers a company (also acts as employee + manager).
  2. Owner creates a `spending_policies` rule: meals ≤ 200 SAR (severity=block).
  3. Employee submits an expense_claim of 500 SAR (meals) — over the cap.
  4. The `tg_check_spending_policy` trigger MUST insert a policy_violations
     row referencing the claim → confirms the "alert" surfaced to staff.
  5. Manager reviews and rejects the claim (PATCH status=rejected) →
     confirms an actionable decision is available.

Prints [PASS]/[FAIL] per scenario. Skips (exit 0) when TEST_SEED_TOKEN or
PGHOST is missing.

Run:  python3 tests/e2e/spending-policy-engine.spec.py
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
SHOTS = Path("/tmp/browser/spending-policy-engine")
SHOTS.mkdir(parents=True, exist_ok=True)


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


async def run(seed_payload):
    owner = seed_payload["credentials"]["owner"]
    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            await page.goto(f"{BASE}/", wait_until="domcontentloaded")

            tok = await rs.sign_in(page, owner["email"], owner["password"])
            if not tok.get("ok"):
                rs.report("1. owner sign-in", False, json.dumps(tok))
                return 1
            rs.report("1. owner sign-in", True)

            reg = await rest(page, "POST", "/rest/v1/rpc/register_company",
                             tok["access_token"],
                             body={"_name": "Policy Engine Co",
                                   "_phone": "0500000077"})
            if reg["status"] != 200 or not reg["body"].get("org_id"):
                rs.report("2. register company", False, json.dumps(reg))
                return 1
            org_id = reg["body"]["org_id"]
            rs.report("2. register company", True, f"org={org_id}")

            # ---- Scenario 3: create policy (meals ≤ 200 SAR, block) ----
            pol = await rest(
                page, "POST", "/rest/v1/spending_policies",
                tok["access_token"],
                body={"org_id": org_id, "category": "meals",
                      "max_amount": 200.00, "currency": "SAR",
                      "rule_type": "max_amount", "severity": "block",
                      "active": True,
                      "note": "E2E meals cap"},
                prefer="return=representation",
            )
            prows = pol["body"] if isinstance(pol["body"], list) else [pol["body"]]
            policy_id = prows[0].get("id") if prows and isinstance(prows[0], dict) else None
            ok3 = pol["status"] in (200, 201) and bool(policy_id)
            rs.report("3. create spending policy", ok3,
                      "" if ok3 else json.dumps(pol))
            if not ok3:
                return 1 + failures

            # ---- Scenario 4: employee submits claim that violates cap ----
            claim = await rest(
                page, "POST", "/rest/v1/expense_claims",
                tok["access_token"],
                body={"org_id": org_id, "submitted_by": tok["user_id"],
                      "title": "Team dinner — over cap",
                      "description": "Client team dinner for 8 people",
                      "amount": 500.00, "currency": "SAR",
                      "category": "meals", "status": "submitted",
                      "claim_number": f"EC-POL-{os.getpid()}"},
                prefer="return=representation",
            )
            crows = claim["body"] if isinstance(claim["body"], list) else [claim["body"]]
            claim_id = crows[0].get("id") if crows and isinstance(crows[0], dict) else None
            ok4 = claim["status"] in (200, 201) and bool(claim_id)
            rs.report("4. submit over-cap claim", ok4,
                      "" if ok4 else json.dumps(claim))
            if not ok4:
                return 1 + failures

            # ---- Scenario 5: trigger raised a policy_violations alert ----
            vrow = psql(
                "SELECT rule_type||'|'||severity||'|'||coalesce(limit_amount::text,'') "
                f"FROM public.policy_violations WHERE claim_id='{claim_id}' LIMIT 1"
            )
            audit_hit = psql(
                "SELECT count(*) FROM public.audit_log "
                f"WHERE entity='expense_claims' AND entity_id='{claim_id}' "
                "AND action='POLICY_VIOLATION'"
            )
            # Also verify staff can SEE the alert via REST (RLS: org members read)
            alerts = await rest(
                page, "GET",
                f"/rest/v1/policy_violations?claim_id=eq.{claim_id}"
                "&select=id,rule_type,severity,reason,amount,limit_amount",
                tok["access_token"],
            )
            visible = alerts["status"] == 200 and isinstance(alerts["body"], list) \
                and len(alerts["body"]) == 1
            ok5 = bool(vrow) and audit_hit == "1" and visible
            rs.report(
                "5. policy engine raised alert", ok5,
                f"violation={vrow} audit={audit_hit} visible_via_REST={visible}",
            )
            if not ok5:
                failures += 1

            await page.screenshot(path=str(SHOTS / "after_violation.png"))

            # ---- Scenario 6: manager decides — reject the offending claim ----
            dec = await rest(
                page, "PATCH",
                f"/rest/v1/expense_claims?id=eq.{claim_id}",
                tok["access_token"],
                body={"status": "rejected",
                      "reviewed_at": "2026-07-07T14:00:00Z",
                      "reviewed_by": tok["user_id"],
                      "rejection_reason": "Exceeds meals policy cap"},
                prefer="return=representation",
            )
            final_status = psql(
                f"SELECT status FROM public.expense_claims WHERE id='{claim_id}'"
            )
            ok6 = dec["status"] in (200, 204) and final_status == "rejected"
            rs.report(
                "6. manager decision (reject)", ok6,
                f"http={dec['status']} status={final_status}",
            )
            if not ok6:
                failures += 1
            await page.screenshot(path=str(SHOTS / "after_decision.png"))
            await ctx.close()
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
        print(f"[fail] seed error: {e}", file=sys.stderr)
        return 1
    if not payload.get("ok"):
        print(f"[fail] seed payload: {payload}", file=sys.stderr)
        return 1
    failures = asyncio.run(run(payload))
    print(f"[done] failures={failures}", file=sys.stderr)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
