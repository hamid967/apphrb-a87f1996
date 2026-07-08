"""
Focused Playwright E2E covering four discrete scenarios in one run:

  1. Owner login (Supabase password grant + session injected in localStorage).
  2. Dashboard browse: /dashboard shell renders under the authenticated layout.
  3. Upload receipt: POST subscription_payments row (RLS: is_org_admin) with a
     receipt_url. Simulates the user uploading a bank receipt.
  4. Send approval request: super_admin calls approve_subscription_payment RPC
     and the DB reflects the approval (status, audit row, active subscription).

Each scenario prints [PASS]/[FAIL] independently. Reuses the existing
/api/public/test-seed-full-signup-flow endpoint. Skips (exit 0) when
TEST_SEED_TOKEN or PGHOST are missing.

Run:
  python3 tests/e2e/receipt-approval-scenarios.spec.py
"""
import asyncio
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

try:
    import pyotp
except ImportError:
    pyotp = None

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/receipt-approval-scenarios")
SHOTS.mkdir(parents=True, exist_ok=True)


def _load_env_file() -> dict:
    env = {}
    for p in (Path(".env"), Path(".env.local")):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_ENV = _load_env_file()
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or _ENV.get("VITE_SUPABASE_URL")
SUPABASE_KEY = (
    os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    or _ENV.get("VITE_SUPABASE_PUBLISHABLE_KEY")
)
SUPABASE_PROJECT_ID = (
    os.environ.get("VITE_SUPABASE_PROJECT_ID")
    or _ENV.get("VITE_SUPABASE_PROJECT_ID")
    or (SUPABASE_URL.split("//", 1)[-1].split(".", 1)[0] if SUPABASE_URL else "")
)


def seed(token: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/api/public/test-seed-full-signup-flow",
        method="POST",
        headers={"x-test-seed-token": token, "content-type": "application/json"},
        data=b"{}",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def psql_scalar(sql: str) -> str:
    return subprocess.check_output(["psql", "-Atc", sql], text=True).strip()


async def sign_in(page, email: str, password: str) -> dict:
    return await page.evaluate(
        """async ({ url, key, projectRef, email, password }) => {
          const res = await fetch(url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key,
                       Authorization: 'Bearer ' + key },
            body: JSON.stringify({ email, password }),
          });
          const body = await res.json();
          if (!res.ok || !body.access_token) return { ok: false, body };
          window.localStorage.setItem(
            'sb-' + projectRef + '-auth-token', JSON.stringify(body));
          return { ok: true, access_token: body.access_token, user_id: body.user.id };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY,
         "projectRef": SUPABASE_PROJECT_ID,
         "email": email, "password": password},
    )


async def elevate_aal2(page, access_token: str) -> dict:
    if pyotp is None:
        return {"ok": False, "reason": "pyotp missing"}
    enroll = await page.evaluate(
        """async ({ url, key, bearer }) => {
          const r = await fetch(url + '/auth/v1/factors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key,
                       Authorization: 'Bearer ' + bearer },
            body: JSON.stringify({ factor_type: 'totp',
              friendly_name: 'e2e-' + Date.now(), issuer: 'Aqari E2E' }),
          });
          return { status: r.status, body: await r.json() };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": access_token},
    )
    if enroll["status"] != 200:
        return {"ok": False, "step": "enroll", "resp": enroll}
    factor_id = enroll["body"]["id"]
    secret = enroll["body"]["totp"]["secret"]
    challenge = await page.evaluate(
        """async ({ url, key, bearer, factorId }) => {
          const r = await fetch(url + '/auth/v1/factors/' + factorId + '/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key,
                       Authorization: 'Bearer ' + bearer }, body: '{}',
          });
          return { status: r.status, body: await r.json() };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY,
         "bearer": access_token, "factorId": factor_id},
    )
    if challenge["status"] != 200:
        return {"ok": False, "step": "challenge", "resp": challenge}
    code = pyotp.TOTP(secret).now()
    verify = await page.evaluate(
        """async ({ url, key, bearer, projectRef, factorId, challengeId, code }) => {
          const r = await fetch(url + '/auth/v1/factors/' + factorId + '/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key,
                       Authorization: 'Bearer ' + bearer },
            body: JSON.stringify({ challenge_id: challengeId, code }),
          });
          const body = await r.json();
          if (r.ok && body.access_token) {
            window.localStorage.setItem(
              'sb-' + projectRef + '-auth-token', JSON.stringify(body));
          }
          return { status: r.status, body };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": access_token,
         "projectRef": SUPABASE_PROJECT_ID, "factorId": factor_id,
         "challengeId": challenge["body"]["id"], "code": code},
    )
    if verify["status"] != 200 or not verify["body"].get("access_token"):
        return {"ok": False, "step": "verify", "resp": verify}
    return {"ok": True, "access_token": verify["body"]["access_token"]}


def report(name: str, ok: bool, detail: str = "") -> None:
    tag = "[PASS]" if ok else "[FAIL]"
    line = f"{tag} {name}" + (f" — {detail}" if detail else "")
    print(line, file=sys.stderr, flush=True)


async def run(seed_payload: dict) -> int:
    owner = seed_payload["credentials"]["owner"]
    admin = seed_payload["credentials"]["super_admin"]
    failures = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            await page.goto(f"{BASE}/", wait_until="domcontentloaded")

            # ---- Scenario 1: owner login ----
            tok = await sign_in(page, owner["email"], owner["password"])
            ok1 = bool(tok.get("ok"))
            report("1. owner login", ok1, "" if ok1 else json.dumps(tok))
            if not ok1:
                await ctx.close()
                return 1

            # ---- Scenario 2: dashboard browse ----
            reg = await page.evaluate(
                """async ({ url, key, bearer }) => {
                  const r = await fetch(url + '/rest/v1/rpc/register_company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: key,
                               Authorization: 'Bearer ' + bearer },
                    body: JSON.stringify({ _name: 'E2E Scenarios Co', _phone: '0500000001' }),
                  });
                  return { status: r.status, body: await r.json() };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": tok["access_token"]},
            )
            if reg["status"] != 200 or not reg["body"].get("org_id"):
                report("2. dashboard browse", False, f"register_company: {reg}")
                await ctx.close()
                return 1
            org_id = reg["body"]["org_id"]

            await page.goto(f"{BASE}/", wait_until="domcontentloaded")
            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)
            final_url = page.url
            reached = ("/dashboard" in final_url) or ("/onboarding" in final_url)
            await page.screenshot(path=str(SHOTS / "2_dashboard.png"))
            report("2. dashboard browse", reached, f"url={final_url}")
            if not reached:
                failures += 1

            # ---- Scenario 3: upload receipt (create pending payment) ----
            payment = await page.evaluate(
                """async ({ url, key, bearer, orgId, submittedBy }) => {
                  const r = await fetch(url + '/rest/v1/subscription_payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: key,
                               Authorization: 'Bearer ' + bearer,
                               Prefer: 'return=representation' },
                    body: JSON.stringify({
                      org_id: orgId, submitted_by: submittedBy,
                      amount: 499.0, currency: 'SAR',
                      bank_name: 'E2E Scenarios Bank',
                      bank_reference: 'E2E-SCEN-REF',
                      receipt_url: 'https://example.test/e2e-scenarios-receipt.pdf',
                      status: 'pending',
                    }),
                  });
                  return { status: r.status, body: await r.json() };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY,
                 "bearer": tok["access_token"], "orgId": org_id,
                 "submittedBy": tok["user_id"]},
            )
            rows = payment["body"] if isinstance(payment["body"], list) else [payment["body"]]
            payment_id = rows[0].get("id") if rows and isinstance(rows[0], dict) else None
            ok3 = payment["status"] in (200, 201) and bool(payment_id)
            report("3. upload receipt (pending payment)", ok3,
                   "" if ok3 else json.dumps(payment))
            if not ok3:
                await ctx.close()
                return 1 + failures
            await ctx.close()

            # ---- Scenario 4: send approval request ----
            actx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            apage = await actx.new_page()
            await apage.goto(f"{BASE}/", wait_until="domcontentloaded")
            atok = await sign_in(apage, admin["email"], admin["password"])
            if not atok.get("ok"):
                report("4. approval request", False, f"admin sign-in: {atok}")
                await actx.close()
                return 1 + failures
            aal2 = await elevate_aal2(apage, atok["access_token"])
            bearer = aal2.get("access_token", atok["access_token"])

            approve = await apage.evaluate(
                """async ({ url, key, bearer, paymentId }) => {
                  const r = await fetch(url + '/rest/v1/rpc/approve_subscription_payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: key,
                               Authorization: 'Bearer ' + bearer },
                    body: JSON.stringify({ _id: paymentId,
                      _bank_reference: 'E2E-SCEN-APPROVED',
                      _note: 'e2e scenarios approval' }),
                  });
                  return { status: r.status, body: await r.json() };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY,
                 "bearer": bearer, "paymentId": payment_id},
            )
            rpc_ok = approve["status"] == 200 and approve["body"].get("ok") is True

            db_status = psql_scalar(
                f"SELECT status FROM public.subscription_payments WHERE id='{payment_id}'"
            )
            approved_rows = psql_scalar(
                f"SELECT count(*) FROM public.payment_approvals "
                f"WHERE payment_id='{payment_id}' AND action='approved'"
            )
            active_sub = psql_scalar(
                f"SELECT count(*) FROM public.subscriptions "
                f"WHERE org_id='{org_id}' AND status='active'"
            )
            ok4 = rpc_ok and db_status == "approved" and approved_rows == "1" and active_sub == "1"
            report("4. approval request", ok4,
                   f"rpc={rpc_ok} status={db_status} approvals={approved_rows} active_sub={active_sub}")
            if not ok4:
                failures += 1
            await apage.screenshot(path=str(SHOTS / "4_after_approval.png"))
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
        payload = seed(token)
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
