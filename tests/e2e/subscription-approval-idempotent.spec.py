"""
Playwright: prove that the manual bank-transfer approval is idempotent.

Flow:
  1. Seed a super_admin user + a fresh PENDING subscription_payment via
     /api/public/test-seed-subscription-approval.
  2. Sign the super_admin in via Supabase Auth REST + localStorage inject
     (same pattern as portal-signed-in.spec).
  3. From the browser context, fire TWO approve_subscription_payment RPC
     calls concurrently against the same payment.
  4. Assert:
       - Exactly one response returns { ok: true, already_reviewed: false }.
       - The other returns { ok: false, already_reviewed: true } and reports
         the SAME winning reviewer + timestamp.
       - psql shows exactly ONE row in payment_approvals for
         (payment_id, action='approved', to_status='approved'), and that
         row's bank_reference is the value passed by the winning call.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST are missing.
"""
import asyncio
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

BASE  = "http://localhost:8080"
SHOTS = Path("/tmp/browser/subscription-approval")
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
        f"{BASE}/api/public/test-seed-subscription-approval",
        method="POST",
        headers={"x-test-seed-token": token, "content-type": "application/json"},
        data=b"{}",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"seed failed: {payload}")
    return payload


def count_approved_audit_rows(payment_id: str) -> int:
    out = subprocess.check_output(
        ["psql", "-Atc",
         f"SELECT count(*) FROM public.payment_approvals "
         f"WHERE payment_id = '{payment_id}' "
         f"AND action='approved' AND to_status='approved'"],
        text=True,
    )
    return int(out.strip())


def approved_bank_reference(payment_id: str) -> str | None:
    out = subprocess.check_output(
        ["psql", "-Atc",
         f"SELECT bank_reference FROM public.payment_approvals "
         f"WHERE payment_id = '{payment_id}' "
         f"AND action='approved' AND to_status='approved' "
         f"ORDER BY created_at DESC LIMIT 1"],
        text=True,
    )
    v = out.strip()
    return v or None


async def run(seed_payload: dict) -> list[str]:
    creds = seed_payload["credentials"]["super_admin"]
    payment_id = seed_payload["seed"]["payment_id"]
    errors: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            ctx  = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            await page.goto(f"{BASE}/", wait_until="domcontentloaded")

            # --- sign in via REST + localStorage inject ---
            token = await page.evaluate(
                """async ({ url, key, projectRef, email, password }) => {
                  const res = await fetch(url + '/auth/v1/token?grant_type=password', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: key,
                      Authorization: 'Bearer ' + key,
                    },
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
                 "email": creds["email"], "password": creds["password"]},
            )
            if not token.get("ok"):
                return [f"sign-in failed: {token}"]

            # --- fire two concurrent approve RPCs against the same payment ---
            race = await page.evaluate(
                """async ({ url, key, bearer, paymentId }) => {
                  const call = (ref) => fetch(url + '/rest/v1/rpc/approve_subscription_payment', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: key,
                      Authorization: 'Bearer ' + bearer,
                    },
                    body: JSON.stringify({
                      _id: paymentId,
                      _bank_reference: ref,
                      _note: 'race-' + ref,
                    }),
                  }).then(async r => ({ status: r.status, body: await r.json() }));
                  const [a, b] = await Promise.all([call('REF-A'), call('REF-B')]);
                  return { a, b };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY,
                 "bearer": token["access_token"], "paymentId": payment_id},
            )
            print(f"[diag] race result: {json.dumps(race)}", file=sys.stderr, flush=True)

            results = [race["a"]["body"], race["b"]["body"]]
            winners  = [r for r in results if r.get("ok") is True]
            losers   = [r for r in results if r.get("already_reviewed") is True and r.get("ok") is False]
            if len(winners) != 1 or len(losers) != 1:
                errors.append(
                    f"expected 1 winner + 1 already_reviewed, got winners={winners} losers={losers}"
                )
                return errors

            winner, loser = winners[0], losers[0]
            if winner["reviewed_by"] != loser["reviewed_by"]:
                errors.append(
                    f"loser reports different reviewer than winner: {loser['reviewed_by']} vs {winner['reviewed_by']}"
                )
            if winner["reviewed_at"] != loser["reviewed_at"]:
                errors.append(
                    f"loser reports different reviewed_at than winner: {loser['reviewed_at']} vs {winner['reviewed_at']}"
                )
            if winner["reviewed_by"] != token["user_id"]:
                errors.append(
                    f"winner reviewer {winner['reviewed_by']} != signed-in user {token['user_id']}"
                )

            # --- audit trail: exactly one approved row, with winner's bank ref ---
            approved_count = count_approved_audit_rows(payment_id)
            if approved_count != 1:
                errors.append(f"payment_approvals rows for approved transition = {approved_count}, expected 1")

            audit_ref = approved_bank_reference(payment_id)
            winner_ref = winner.get("bank_reference")
            if audit_ref != winner_ref:
                errors.append(
                    f"audit bank_reference={audit_ref!r} does not match winner bank_reference={winner_ref!r}"
                )

            # --- second (sequential) duplicate call still returns already_reviewed ---
            third = await page.evaluate(
                """async ({ url, key, bearer, paymentId }) => {
                  const res = await fetch(url + '/rest/v1/rpc/approve_subscription_payment', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: key,
                      Authorization: 'Bearer ' + bearer,
                    },
                    body: JSON.stringify({ _id: paymentId, _bank_reference: 'REF-C', _note: 'third' }),
                  });
                  return await res.json();
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY,
                 "bearer": token["access_token"], "paymentId": payment_id},
            )
            if not (third.get("ok") is False and third.get("already_reviewed") is True):
                errors.append(f"third call did not report already_reviewed: {third}")

            approved_count2 = count_approved_audit_rows(payment_id)
            if approved_count2 != 1:
                errors.append(
                    f"audit rows changed after third call: {approved_count2}, expected 1 (still)"
                )

            await page.screenshot(path=str(SHOTS / "post_race.png"))
            await ctx.close()
        finally:
            await browser.close()
    return errors


def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if not token:
        print("SKIP: TEST_SEED_TOKEN not set")
        return 0
    if not os.environ.get("PGHOST"):
        print("SKIP: PGHOST not set (need psql for audit assertions)")
        return 0
    try:
        seed_payload = seed(token)
    except Exception as e:
        print(f"FAIL: seed error: {e}", file=sys.stderr)
        return 1
    print(f"seeded payment: {seed_payload['seed']['payment_id']}")
    errors = asyncio.run(run(seed_payload))
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: double-approval race returned exactly one winner and one audit row")
    return 0


if __name__ == "__main__":
    sys.exit(main())