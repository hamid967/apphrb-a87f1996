"""
Playwright E2E: full company signup → subscription payment → super_admin approval.

Flow:
  1. Seed via /api/public/test-seed-full-signup-flow (owner + super_admin creds).
  2. As OWNER (Supabase REST + localStorage inject):
       a. Call register_company RPC → get org_id.
       b. Insert a PENDING subscription_payments row (RLS: is_org_admin).
     Screenshot: /_authenticated dashboard while access is pending.
  3. As SUPER_ADMIN (fresh browser context):
       a. Call approve_subscription_payment RPC.
     Screenshot: super-admin approvals page.
  4. Assertions via psql:
       - subscription_payments.status = 'approved', reviewed_by = super_admin.
       - Exactly one 'approved' row in payment_approvals for the payment.
       - A row exists in subscriptions for org_id with status 'active' (created
         by the approval trigger/RPC).
  5. Re-sign-in as OWNER, reload dashboard.
     Screenshot: dashboard after activation.

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

try:
    import pyotp  # RFC-6238 TOTP for the MFA step
except ImportError:  # pragma: no cover
    pyotp = None

BASE  = "http://localhost:8080"
SHOTS = Path("/tmp/browser/full-signup-flow")
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
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"seed failed: {payload}")
    return payload


def psql_scalar(sql: str) -> str:
    return subprocess.check_output(["psql", "-Atc", sql], text=True).strip()


async def sign_in(page, email: str, password: str) -> dict:
    """Sign in via Supabase REST and inject session into localStorage."""
    return await page.evaluate(
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
         "email": email, "password": password},
    )


async def elevate_to_aal2(page, access_token: str) -> dict:
    """Enroll a fresh TOTP factor and verify it to reach AAL2.

    Returns the new session body (with aal2 access_token) and stores it in
    localStorage under the sb-<projectRef>-auth-token key so subsequent
    navigations use the elevated session.
    """
    if pyotp is None:
        return {"ok": False, "reason": "pyotp not installed"}

    # Step 1: enroll → { id, totp: { secret, ... } }
    enroll = await page.evaluate(
        """async ({ url, key, bearer }) => {
          const res = await fetch(url + '/auth/v1/factors', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: key,
              Authorization: 'Bearer ' + bearer,
            },
            body: JSON.stringify({
              factor_type: 'totp',
              friendly_name: 'e2e-' + Date.now(),
              issuer: 'Aqari E2E',
            }),
          });
          return { status: res.status, body: await res.json() };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": access_token},
    )
    if enroll["status"] != 200:
        return {"ok": False, "step": "enroll", "resp": enroll}
    factor_id = enroll["body"]["id"]
    secret = enroll["body"]["totp"]["secret"]

    # Step 2: challenge → { id }
    challenge = await page.evaluate(
        """async ({ url, key, bearer, factorId }) => {
          const res = await fetch(url + '/auth/v1/factors/' + factorId + '/challenge', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: key,
              Authorization: 'Bearer ' + bearer,
            },
            body: '{}',
          });
          return { status: res.status, body: await res.json() };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY,
         "bearer": access_token, "factorId": factor_id},
    )
    if challenge["status"] != 200:
        return {"ok": False, "step": "challenge", "resp": challenge}
    challenge_id = challenge["body"]["id"]

    # Step 3: verify with a fresh TOTP → new AAL2 session
    code = pyotp.TOTP(secret).now()
    verify = await page.evaluate(
        """async ({ url, key, bearer, projectRef, factorId, challengeId, code }) => {
          const res = await fetch(url + '/auth/v1/factors/' + factorId + '/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: key,
              Authorization: 'Bearer ' + bearer,
            },
            body: JSON.stringify({ challenge_id: challengeId, code }),
          });
          const body = await res.json();
          if (res.ok && body.access_token) {
            window.localStorage.setItem(
              'sb-' + projectRef + '-auth-token', JSON.stringify(body));
          }
          return { status: res.status, body };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": access_token,
         "projectRef": SUPABASE_PROJECT_ID,
         "factorId": factor_id, "challengeId": challenge_id, "code": code},
    )
    if verify["status"] != 200 or not verify["body"].get("access_token"):
        return {"ok": False, "step": "verify", "resp": verify}
    return {"ok": True, "access_token": verify["body"]["access_token"]}


async def run(seed_payload: dict) -> list[str]:
    owner_creds = seed_payload["credentials"]["owner"]
    admin_creds = seed_payload["credentials"]["super_admin"]
    errors: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # ============== Step 1: OWNER registers company + submits payment ==============
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            await page.goto(f"{BASE}/", wait_until="domcontentloaded")

            owner_tok = await sign_in(page, owner_creds["email"], owner_creds["password"])
            if not owner_tok.get("ok"):
                return [f"owner sign-in failed: {owner_tok}"]

            register = await page.evaluate(
                """async ({ url, key, bearer }) => {
                  const res = await fetch(url + '/rest/v1/rpc/register_company', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: key,
                      Authorization: 'Bearer ' + bearer,
                    },
                    body: JSON.stringify({ _name: 'E2E Signup Co', _phone: '0500000000' }),
                  });
                  return { status: res.status, body: await res.json() };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY, "bearer": owner_tok["access_token"]},
            )
            print(f"[diag] register_company: {json.dumps(register)}", file=sys.stderr, flush=True)
            if register["status"] != 200 or not register["body"].get("org_id"):
                return [f"register_company failed: {register}"]
            org_id = register["body"]["org_id"]

            payment = await page.evaluate(
                """async ({ url, key, bearer, orgId, submittedBy }) => {
                  const res = await fetch(url + '/rest/v1/subscription_payments', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: key,
                      Authorization: 'Bearer ' + bearer,
                      Prefer: 'return=representation',
                    },
                    body: JSON.stringify({
                      org_id: orgId,
                      submitted_by: submittedBy,
                      amount: 499.0,
                      currency: 'SAR',
                      bank_name: 'E2E Bank',
                      bank_reference: 'E2E-FLOW-REF',
                      receipt_url: 'https://example.test/e2e-flow-receipt.pdf',
                      status: 'pending',
                    }),
                  });
                  return { status: res.status, body: await res.json() };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY,
                 "bearer": owner_tok["access_token"],
                 "orgId": org_id, "submittedBy": owner_tok["user_id"]},
            )
            print(f"[diag] insert payment: {json.dumps(payment)}", file=sys.stderr, flush=True)
            body = payment["body"]
            rows = body if isinstance(body, list) else [body]
            if payment["status"] not in (200, 201) or not rows or not rows[0].get("id"):
                return [f"insert subscription_payments failed: {payment}"]
            payment_id = rows[0]["id"]

            # UI snapshot: dashboard while payment is still pending.
            # Reload from `/` so the browser Supabase client picks up the
            # session we injected into localStorage; then navigate and
            # wait for the actual shell to mount before screenshotting.
            await page.goto(f"{BASE}/", wait_until="domcontentloaded")
            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            try:
                await page.wait_for_selector(
                    '[data-testid="dashboard-shell"]', state="visible", timeout=30000
                )
            except Exception as e:
                errors.append(f"dashboard-shell did not appear (pending): {e}")
            await page.screenshot(path=str(SHOTS / "1_owner_dashboard_pending.png"))
            await ctx.close()

            # ============== Step 2: SUPER_ADMIN approves the payment ==============
            admin_ctx  = await browser.new_context(viewport={"width": 1280, "height": 1800})
            admin_page = await admin_ctx.new_page()
            await admin_page.goto(f"{BASE}/", wait_until="domcontentloaded")

            admin_tok = await sign_in(admin_page, admin_creds["email"], admin_creds["password"])
            if not admin_tok.get("ok"):
                return [f"super_admin sign-in failed: {admin_tok}"]

            # Elevate to AAL2 via a freshly-enrolled TOTP factor so we can
            # pass the /_authenticated/admin MFA gate. The seed endpoint has
            # already wiped any pre-existing factors on this user.
            aal2 = await elevate_to_aal2(admin_page, admin_tok["access_token"])
            print(f"[diag] mfa elevation: {json.dumps({k: v for k, v in aal2.items() if k != 'access_token'})}",
                  file=sys.stderr, flush=True)
            if not aal2.get("ok"):
                errors.append(f"MFA elevation failed: {aal2}")
            admin_bearer = aal2.get("access_token", admin_tok["access_token"])

            approve = await admin_page.evaluate(
                """async ({ url, key, bearer, paymentId }) => {
                  const res = await fetch(url + '/rest/v1/rpc/approve_subscription_payment', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: key,
                      Authorization: 'Bearer ' + bearer,
                    },
                    body: JSON.stringify({
                      _id: paymentId,
                      _bank_reference: 'APPROVED-E2E-REF',
                      _note: 'e2e full-flow approval',
                    }),
                  });
                  return { status: res.status, body: await res.json() };
                }""",
                {"url": SUPABASE_URL, "key": SUPABASE_KEY,
                 "bearer": admin_bearer, "paymentId": payment_id},
            )
            print(f"[diag] approve: {json.dumps(approve)}", file=sys.stderr, flush=True)
            if approve["status"] != 200 or approve["body"].get("ok") is not True:
                errors.append(f"approve_subscription_payment did not succeed: {approve}")

            await admin_page.goto(f"{BASE}/", wait_until="domcontentloaded")
            await admin_page.goto(
                f"{BASE}/admin/subscription-payments", wait_until="domcontentloaded"
            )
            # With AAL2 in localStorage, the admin gate should let us in and
            # render the approvals shell. Fail if the guard sends us anywhere
            # else (dashboard, /security/mfa, /auth).
            try:
                await admin_page.wait_for_selector(
                    '[data-testid="admin-subscription-payments"]',
                    state="visible",
                    timeout=30000,
                )
            except Exception as e:
                errors.append(f"admin approvals page did not render: {e}")
            final_url = admin_page.url
            print(f"[diag] admin final url: {final_url}", file=sys.stderr, flush=True)

            # Switch to the "Approved" tab (Arabic or English label) and
            # confirm the row we just approved is listed in the UI, not
            # just in the DB.
            try:
                clicked = False
                for label in ("مقبولة", "Approved"):
                    btn = admin_page.locator(
                        f'[data-testid="admin-subscription-payments"] button:has-text("{label}")'
                    ).first
                    if await btn.count():
                        await btn.click(timeout=5000)
                        clicked = True
                        break
                if not clicked:
                    errors.append("could not find Approved tab button")
                else:
                    await admin_page.wait_for_selector(
                        "text=APPROVED-E2E-REF", state="visible", timeout=15000
                    )
            except Exception as e:
                errors.append(f"approved payment row not visible in admin UI: {e}")

            await admin_page.screenshot(path=str(SHOTS / "2_admin_approvals.png"))
            await admin_ctx.close()

            # ============== Step 3: DB assertions ==============
            status = psql_scalar(
                f"SELECT status FROM public.subscription_payments WHERE id = '{payment_id}'"
            )
            if status != "approved":
                errors.append(f"subscription_payments.status = {status!r}, expected 'approved'")

            reviewer = psql_scalar(
                f"SELECT COALESCE(reviewed_by::text,'') FROM public.subscription_payments WHERE id = '{payment_id}'"
            )
            if reviewer != admin_creds["user_id"]:
                errors.append(f"reviewed_by = {reviewer!r}, expected super_admin uid")

            approved_rows = psql_scalar(
                f"SELECT count(*) FROM public.payment_approvals "
                f"WHERE payment_id = '{payment_id}' AND action='approved' AND to_status='approved'"
            )
            if approved_rows != "1":
                errors.append(f"payment_approvals approved rows = {approved_rows}, expected 1")

            # An approved payment must leave an audit trail linking the reviewer
            # to the winning bank_reference (the value the RPC persisted).
            audit_ref = psql_scalar(
                f"SELECT COALESCE(bank_reference,'') FROM public.payment_approvals "
                f"WHERE payment_id = '{payment_id}' AND action='approved' AND to_status='approved' "
                f"ORDER BY created_at DESC LIMIT 1"
            )
            if audit_ref != "APPROVED-E2E-REF":
                errors.append(f"payment_approvals.bank_reference = {audit_ref!r}, expected 'APPROVED-E2E-REF'")

            # Approval trigger must auto-activate a subscription for the org.
            sub_count = psql_scalar(
                f"SELECT count(*) FROM public.subscriptions "
                f"WHERE org_id = '{org_id}' AND status = 'active'"
            )
            if sub_count != "1":
                errors.append(f"active subscriptions for org after approval = {sub_count}, expected 1")

            # Payment must be back-linked to the new subscription row.
            linked = psql_scalar(
                f"SELECT COALESCE(subscription_id::text,'') FROM public.subscription_payments "
                f"WHERE id = '{payment_id}'"
            )
            if not linked:
                errors.append("subscription_payments.subscription_id was not back-linked after approval")

            # ============== Step 4: OWNER re-loads dashboard (should be unlocked) ==============
            owner_ctx2  = await browser.new_context(viewport={"width": 1280, "height": 1800})
            owner_page2 = await owner_ctx2.new_page()
            await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
            owner_tok2 = await sign_in(owner_page2, owner_creds["email"], owner_creds["password"])
            if not owner_tok2.get("ok"):
                errors.append(f"owner re-sign-in failed: {owner_tok2}")
            else:
                await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                await owner_page2.goto(
                    f"{BASE}/dashboard", wait_until="domcontentloaded"
                )
                # 4a. Before completing onboarding, /dashboard must
                #     redirect the owner to the wizard.
                try:
                    await owner_page2.wait_for_url(
                        "**/onboarding/wizard", timeout=15000
                    )
                except Exception as e:
                    errors.append(
                        f"onboarding gate did not redirect to /onboarding/wizard "
                        f"(url={owner_page2.url}): {e}"
                    )
                await owner_page2.screenshot(
                    path=str(SHOTS / "3a_owner_onboarding_wizard.png")
                )

                # 4a-bis. Hard guard: directly requesting the KPIs page
                # (/dashboard/auto) before onboarding completion must bounce
                # to /onboarding/wizard AND must not render any part of the
                # KPI panel (data-testid="kpi-auto-panel"). This proves the
                # server-side loader guard (requireOnboardingComplete) is
                # rejecting the request rather than leaking KPI markup.
                await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                await owner_page2.goto(
                    f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                )
                try:
                    await owner_page2.wait_for_url(
                        "**/onboarding/wizard", timeout=15000
                    )
                except Exception as e:
                    errors.append(
                        f"/dashboard/auto did not redirect pre-onboarding "
                        f"(url={owner_page2.url}): {e}"
                    )
                # Give the client a moment to render anything it was going
                # to render, then assert the KPI panel is nowhere in the DOM.
                await owner_page2.wait_for_timeout(1000)
                kpi_count = await owner_page2.locator(
                    '[data-testid="kpi-auto-panel"]'
                ).count()
                if kpi_count > 0:
                    errors.append(
                        f"KPI panel leaked before onboarding completion "
                        f"(kpi_count={kpi_count}, url={owner_page2.url})"
                    )
                await owner_page2.screenshot(
                    path=str(SHOTS / "3a2_kpi_blocked_pre_onboarding.png")
                )

                # 4a-tri. Single-step permutations: for each of the three
                # required steps, reset onboarding, mark ONLY that step
                # done, then confirm /dashboard/auto still redirects and
                # the KPI panel never renders. This proves the loader
                # guard demands ALL three, not any one.
                owner_uid_perm = owner_creds["user_id"]
                for only_step in ("profile", "company", "first_receipt"):
                    # Reset to a clean slate.
                    reset_req = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(
                            {"user_id": owner_uid_perm, "reset": True}
                        ).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(reset_req, timeout=30) as resp:
                        reset_payload = json.loads(resp.read().decode("utf-8"))
                    if not reset_payload.get("ok"):
                        errors.append(f"reset before {only_step!r} failed: {reset_payload}")
                        continue
                    # Mark just the one step done.
                    step_req = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(
                            {"user_id": owner_uid_perm, "step": only_step}
                        ).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(step_req, timeout=30) as resp:
                        step_payload = json.loads(resp.read().decode("utf-8"))
                    if not step_payload.get("ok") or step_payload.get("completed_at"):
                        errors.append(
                            f"single-step seed for {only_step!r} unexpected: {step_payload}"
                        )
                    # DB sanity: exactly that step done, other two missing,
                    # completed_at NULL.
                    prog_json = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    prog_obj = json.loads(prog_json or "{}")
                    for s in ("profile", "company", "first_receipt"):
                        expected_done = s == only_step
                        actual_done = (prog_obj.get(s) or {}).get("done") is True
                        if expected_done != actual_done:
                            errors.append(
                                f"[perm {only_step!r}] step {s}.done={actual_done}, "
                                f"expected {expected_done}; progress={prog_obj}"
                            )
                    cat = psql_scalar(
                        "SELECT COALESCE(onboarding_completed_at::text,'') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    if cat:
                        errors.append(
                            f"[perm {only_step!r}] onboarding_completed_at should be NULL, got {cat!r}"
                        )
                    # Hit /dashboard/auto: must redirect + never render panel.
                    await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                    await owner_page2.goto(
                        f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                    )
                    try:
                        await owner_page2.wait_for_url(
                            "**/onboarding/wizard", timeout=15000
                        )
                    except Exception as e:
                        errors.append(
                            f"[perm {only_step!r}] /dashboard/auto did not redirect "
                            f"(url={owner_page2.url}): {e}"
                        )
                    await owner_page2.wait_for_timeout(800)
                    perm_kpi = await owner_page2.locator(
                        '[data-testid="kpi-auto-panel"]'
                    ).count()
                    if perm_kpi > 0:
                        errors.append(
                            f"[perm {only_step!r}] KPI panel leaked with only "
                            f"one step done (url={owner_page2.url})"
                        )
                # 4a-quad. Two-of-three permutations: for each pair, reset
                # onboarding, mark exactly those two steps done, confirm
                # the third is missing + completed_at NULL, then hit
                # /dashboard/auto and verify redirect + no kpi-auto-panel.
                TWO_OF_THREE = [
                    ("profile", "company"),
                    ("profile", "first_receipt"),
                    ("company", "first_receipt"),
                ]
                for pair in TWO_OF_THREE:
                    missing = next(
                        s for s in ("profile", "company", "first_receipt") if s not in pair
                    )
                    # Reset.
                    reset_req = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(
                            {"user_id": owner_uid_perm, "reset": True}
                        ).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(reset_req, timeout=30) as resp:
                        resp.read()
                    # Seed the two steps.
                    for s in pair:
                        seed_req = urllib.request.Request(
                            f"{BASE}/api/public/test-seed-complete-onboarding",
                            data=json.dumps(
                                {"user_id": owner_uid_perm, "step": s}
                            ).encode("utf-8"),
                            method="POST",
                            headers={
                                "Content-Type": "application/json",
                                "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                            },
                        )
                        with urllib.request.urlopen(seed_req, timeout=30) as resp:
                            seed_payload_s = json.loads(resp.read().decode("utf-8"))
                        if not seed_payload_s.get("ok"):
                            errors.append(
                                f"[pair {pair}] seed for {s!r} failed: {seed_payload_s}"
                            )
                    # DB sanity: pair done, third missing, completed_at NULL.
                    prog_json = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    prog_obj = json.loads(prog_json or "{}")
                    for s in pair:
                        if (prog_obj.get(s) or {}).get("done") is not True:
                            errors.append(
                                f"[pair {pair}] step {s}.done should be true "
                                f"but got {prog_obj.get(s)!r}"
                            )
                    if (prog_obj.get(missing) or {}).get("done") is True:
                        errors.append(
                            f"[pair {pair}] step {missing!r} unexpectedly done; "
                            f"progress={prog_obj}"
                        )
                    cat = psql_scalar(
                        "SELECT COALESCE(onboarding_completed_at::text,'') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    if cat:
                        errors.append(
                            f"[pair {pair}] onboarding_completed_at should be NULL, got {cat!r}"
                        )
                    # Precision: exactly TWO steps carry done=true (no more,
                    # no fewer, no stray keys), and completed_at is exactly
                    # NULL at the SQL level (not just empty string).
                    done_count = sum(
                        1
                        for s in ("profile", "company", "first_receipt")
                        if (prog_obj.get(s) or {}).get("done") is True
                    )
                    if done_count != 2:
                        errors.append(
                            f"[pair {pair}] onboarding_progress done-count "
                            f"expected 2, got {done_count}; progress={prog_obj}"
                        )
                    stray = [
                        k
                        for k in prog_obj.keys()
                        if k not in ("profile", "company", "first_receipt")
                    ]
                    if stray:
                        errors.append(
                            f"[pair {pair}] onboarding_progress has stray "
                            f"keys {stray!r}"
                        )
                    cat_is_null = psql_scalar(
                        "SELECT (onboarding_completed_at IS NULL)::text "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    if (cat_is_null or "").strip().lower() != "t" and \
                       (cat_is_null or "").strip().lower() != "true":
                        errors.append(
                            f"[pair {pair}] onboarding_completed_at IS NULL "
                            f"check failed (got {cat_is_null!r})"
                        )
                    # Navigate to KPIs; must redirect + never render panel.
                    await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                    await owner_page2.goto(
                        f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                    )
                    try:
                        await owner_page2.wait_for_url(
                            "**/onboarding/wizard", timeout=15000
                        )
                    except Exception as e:
                        errors.append(
                            f"[pair {pair}] /dashboard/auto did not redirect "
                            f"with only {list(pair)} done, missing {missing!r} "
                            f"(url={owner_page2.url}): {e}"
                        )
                    await owner_page2.wait_for_timeout(800)
                    pair_kpi = await owner_page2.locator(
                        '[data-testid="kpi-auto-panel"]'
                    ).count()
                    if pair_kpi > 0:
                        errors.append(
                            f"[pair {pair}] KPI panel leaked with only "
                            f"two steps done (missing {missing!r}, url={owner_page2.url})"
                        )
                    await owner_page2.screenshot(
                        path=str(SHOTS / f"3c_kpi_blocked_pair_missing_{missing}.png")
                    )
                # 4a-pent. Missing-pair permutations: enumerate each PAIR of
                # missing steps explicitly (i.e. only the third step is
                # done). Confirms the redirect behavior is byte-identical
                # across every pair of missing steps — same landing path,
                # same absence of kpi-auto-panel — not just "one of the
                # three redirected".
                MISSING_PAIRS = [
                    ("company", "first_receipt"),   # only profile done
                    ("profile", "first_receipt"),   # only company done
                    ("profile", "company"),         # only first_receipt done
                ]
                pair_landing_urls: list[str] = []
                for missing_pair in MISSING_PAIRS:
                    only_done = next(
                        s for s in ("profile", "company", "first_receipt")
                        if s not in missing_pair
                    )
                    # Reset.
                    reset_req = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(
                            {"user_id": owner_uid_perm, "reset": True}
                        ).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(reset_req, timeout=30) as resp:
                        resp.read()
                    # Mark only the non-missing step done.
                    seed_req = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(
                            {"user_id": owner_uid_perm, "step": only_done}
                        ).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(seed_req, timeout=30) as resp:
                        seed_p = json.loads(resp.read().decode("utf-8"))
                    if not seed_p.get("ok") or seed_p.get("completed_at"):
                        errors.append(
                            f"[missing-pair {missing_pair}] seed unexpected: {seed_p}"
                        )
                    # DB sanity: both missing steps NOT done, completed_at NULL.
                    prog_json = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    prog_obj = json.loads(prog_json or "{}")
                    for s in missing_pair:
                        if (prog_obj.get(s) or {}).get("done") is True:
                            errors.append(
                                f"[missing-pair {missing_pair}] {s!r} should be "
                                f"missing but was done; progress={prog_obj}"
                            )
                    cat = psql_scalar(
                        "SELECT COALESCE(onboarding_completed_at::text,'') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    if cat:
                        errors.append(
                            f"[missing-pair {missing_pair}] completed_at should "
                            f"be NULL, got {cat!r}"
                        )
                    # Hit /dashboard/auto: must redirect, panel must not render.
                    await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                    await owner_page2.goto(
                        f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                    )
                    try:
                        await owner_page2.wait_for_url(
                            "**/onboarding/wizard", timeout=15000
                        )
                    except Exception as e:
                        errors.append(
                            f"[missing-pair {missing_pair}] /dashboard/auto did "
                            f"not redirect (url={owner_page2.url}): {e}"
                        )
                    await owner_page2.wait_for_timeout(800)
                    mp_kpi = await owner_page2.locator(
                        '[data-testid="kpi-auto-panel"]'
                    ).count()
                    if mp_kpi > 0:
                        errors.append(
                            f"[missing-pair {missing_pair}] kpi-auto-panel "
                            f"leaked (url={owner_page2.url})"
                        )
                    # Normalize the landing URL (strip query/hash) so we can
                    # assert every missing-pair lands identically.
                    from urllib.parse import urlsplit
                    parts = urlsplit(owner_page2.url)
                    pair_landing_urls.append(f"{parts.scheme}://{parts.netloc}{parts.path}")
                    await owner_page2.screenshot(
                        path=str(SHOTS / f"3d_kpi_blocked_missing_pair_{'_'.join(missing_pair)}.png")
                    )
                # All three missing-pair permutations must land on the SAME
                # /onboarding/wizard URL — proves the redirect target is
                # stable regardless of which pair is missing.
                unique_landings = set(pair_landing_urls)
                if len(unique_landings) != 1:
                    errors.append(
                        f"missing-pair redirects diverged across permutations: "
                        f"{pair_landing_urls}"
                    )
                elif not next(iter(unique_landings)).endswith("/onboarding/wizard"):
                    errors.append(
                        f"missing-pair redirects did not land on /onboarding/wizard: "
                        f"{unique_landings}"
                    )
                # 4a-hex. Network-level proof that the redirect from
                # /dashboard/auto to /onboarding/wizard fires ZERO KPI
                # data requests and never mounts kpi-auto-panel. The
                # server-side loader guard should redirect before any
                # KPI server-fn (recommendDashboard / runDashboardTool /
                # getMyDashboardLayout / saveAutoDashboardLayout) is
                # ever invoked from the client, and before the KPI
                # component tree hydrates.
                KPI_URL_MARKERS = (
                    "runDashboardTool",
                    "recommendDashboard",
                    "getMyDashboardLayout",
                    "saveAutoDashboardLayout",
                    "getDashboardMetrics",
                    "getDashboardAnalytics",
                    "getMetricBreakdown",
                    "dash-tool",
                    "dashboard-layout",
                    "dashboard-metrics",
                    "dashboard-analytics",
                )
                # Reset then seed just one step (2 steps still missing).
                for req_body in (
                    {"user_id": owner_uid_perm, "reset": True},
                    {"user_id": owner_uid_perm, "step": "profile"},
                ):
                    r = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(req_body).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(r, timeout=30) as resp:
                        resp.read()
                kpi_hits: list[str] = []

                def _on_request(req):
                    u = req.url
                    # Ignore Vite dev-server source module fetches (import
                    # graph pulls in *.functions.ts source files during
                    # HMR/prefetch — those are NOT KPI data calls).
                    if "/src/" in u or u.endswith(".ts") or u.endswith(".tsx"):
                        return
                    if any(m in u for m in KPI_URL_MARKERS):
                        kpi_hits.append(f"{req.method} {u}")

                def _on_response(resp):
                    u = resp.url
                    if "/src/" in u or u.endswith(".ts") or u.endswith(".tsx"):
                        return
                    if any(m in u for m in KPI_URL_MARKERS):
                        kpi_hits.append(f"RESP {resp.status} {u}")

                owner_page2.on("request", _on_request)
                owner_page2.on("response", _on_response)
                try:
                    # Prime with a neutral page so nothing lingers from prior nav.
                    await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                    await owner_page2.goto(
                        f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                    )
                    try:
                        await owner_page2.wait_for_url(
                            "**/onboarding/wizard", timeout=15000
                        )
                    except Exception as e:
                        errors.append(
                            f"[kpi-network] /dashboard/auto did not redirect "
                            f"(url={owner_page2.url}): {e}"
                        )
                    # Give client extra time to (incorrectly) fire any late
                    # KPI requests or hydrate a stray panel.
                    await owner_page2.wait_for_timeout(1500)
                finally:
                    owner_page2.remove_listener("request", _on_request)
                    owner_page2.remove_listener("response", _on_response)
                # Zero KPI-related HTTP traffic must have fired.
                if kpi_hits:
                    errors.append(
                        f"[kpi-network] KPI data requests fired during redirect "
                        f"({len(kpi_hits)}): {kpi_hits[:5]}"
                    )
                # DOM must not contain kpi-auto-panel.
                kpi_dom = await owner_page2.locator(
                    '[data-testid="kpi-auto-panel"]'
                ).count()
                if kpi_dom > 0:
                    errors.append(
                        f"[kpi-network] kpi-auto-panel present in DOM after "
                        f"redirect (count={kpi_dom}, url={owner_page2.url})"
                    )
                # Belt-and-suspenders: the panel's user-facing headline
                # must not be visible either.
                kpi_heading = await owner_page2.get_by_text(
                    "لوحة KPIs ذكية"
                ).count()
                if kpi_heading > 0:
                    errors.append(
                        f"[kpi-network] KPI heading leaked in DOM after redirect "
                        f"(count={kpi_heading})"
                    )
                await owner_page2.screenshot(
                    path=str(SHOTS / "3e_kpi_no_network_after_redirect.png")
                )
                # 4a-sept. Wizard progress indicator + "continue" gating.
                # The owner already registered a company earlier in this
                # spec, so /onboarding/wizard hydrates to its last step
                # (property / "أول عقار"). From a reset onboarding_progress
                # slate, the wizard must:
                #  - render the 3-step stepper with steps 1 & 2 marked
                #    done (✓ check icon) and step 3 marked aria-current
                #  - show the progress line "الخطوة 3 من 3"
                #  - expose the final "continue" button
                #    ("إنشاء وبدء العمل") but refuse to advance out of
                #    the wizard while required fields are empty
                #  - keep /dashboard/auto redirecting back to the wizard
                #    as long as first_receipt is not marked done
                r = urllib.request.Request(
                    f"{BASE}/api/public/test-seed-complete-onboarding",
                    data=json.dumps(
                        {"user_id": owner_uid_perm, "reset": True}
                    ).encode("utf-8"),
                    method="POST",
                    headers={
                        "Content-Type": "application/json",
                        "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                    },
                )
                with urllib.request.urlopen(r, timeout=30) as resp:
                    resp.read()
                await owner_page2.goto(
                    f"{BASE}/onboarding/wizard", wait_until="domcontentloaded"
                )
                try:
                    await owner_page2.wait_for_selector(
                        'ol[aria-label="خطوات التفعيل"]', timeout=15000
                    )
                except Exception as e:
                    errors.append(f"[wizard] stepper never rendered: {e}")
                # Wait for the wizard to finish its own async hydration
                # (getMyAccessContext / profile fetch) — the "جارٍ التحقّق…"
                # spinner is replaced by the property-step form headline.
                try:
                    await owner_page2.wait_for_selector(
                        "text=أضف أول عقار", timeout=15000
                    )
                except Exception:
                    pass
                # Progress line: "الخطوة 3 من 3" (owner has org already).
                progress_txt = await owner_page2.locator(
                    "text=/الخطوة\\s+3\\s+من\\s+3/"
                ).count()
                if progress_txt < 1:
                    body_txt = (await owner_page2.locator("body").inner_text())[:400]
                    errors.append(
                        f"[wizard] progress indicator 'الخطوة 3 من 3' not found; "
                        f"body snippet={body_txt!r}"
                    )
                current_count = await owner_page2.locator(
                    'ol[aria-label="خطوات التفعيل"] [aria-current="step"]'
                ).count()
                if current_count != 1:
                    errors.append(
                        f"[wizard] aria-current='step' count expected 1, got {current_count}"
                    )
                third_current = await owner_page2.locator(
                    'ol[aria-label="خطوات التفعيل"] > li:nth-child(3) [aria-current="step"]'
                ).count()
                if third_current != 1:
                    errors.append(
                        "[wizard] third stepper item is not aria-current='step' "
                        "(owner already registered a company; expected wizard "
                        "to hydrate to the property step)"
                    )
                # Steps 1 & 2 must show the ✓ check icon (done).
                for nth in (1, 2):
                    done_check = await owner_page2.locator(
                        f'ol[aria-label="خطوات التفعيل"] > li:nth-child({nth}) svg.lucide-check'
                    ).count()
                    if done_check < 1:
                        errors.append(
                            f"[wizard] step {nth} missing done ✓ icon"
                        )
                # Final "continue" button: "إنشاء وبدء العمل". It must be
                # present and enabled, but pressing it with an empty
                # required "اسم العقار" must NOT navigate out of the
                # wizard (browser required-validation + client toast both
                # block); the progress indicator must stay on "الخطوة 3".
                continue_btn = owner_page2.get_by_role(
                    "button", name="إنشاء وبدء العمل"
                )
                if await continue_btn.count() < 1:
                    errors.append(
                        "[wizard] 'إنشاء وبدء العمل' continue button missing "
                        "on property step"
                    )
                else:
                    await continue_btn.first.click()
                    await owner_page2.wait_for_timeout(700)
                    if "/onboarding/wizard" not in owner_page2.url:
                        errors.append(
                            f"[wizard] continue button navigated away with an "
                            f"empty required field (url={owner_page2.url})"
                        )
                    still_on_step_3 = await owner_page2.locator(
                        "text=/الخطوة\\s+3\\s+من\\s+3/"
                    ).count()
                    if still_on_step_3 < 1:
                        errors.append(
                            "[wizard] pressing continue with empty required "
                            "'اسم العقار' left the wizard step indicator"
                        )
                    prog_json = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                    )
                    prog_obj = json.loads(prog_json or "{}")
                    if (prog_obj.get("first_receipt") or {}).get("done") is True:
                        errors.append(
                            f"[wizard] first_receipt marked done by an "
                            f"empty-form submit; progress={prog_obj}"
                        )
                # And /dashboard/auto must still refuse to render.
                await owner_page2.goto(
                    f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                )
                try:
                    await owner_page2.wait_for_url(
                        "**/onboarding/wizard", timeout=15000
                    )
                except Exception as e:
                    errors.append(
                        f"[wizard] /dashboard/auto did not redirect back to "
                        f"wizard while onboarding is incomplete: {e}"
                    )
                await owner_page2.screenshot(
                    path=str(SHOTS / "3f_wizard_step3_indicator.png")
                )
                # 4a-oct. Affirmative case: with ALL three onboarding
                # steps marked done via the seed endpoint,
                # onboarding_completed_at must be non-NULL AND
                # /dashboard/auto must render kpi-auto-panel WITHOUT
                # redirecting back to /onboarding/wizard. This is the
                # mirror of the missing-pair / single-step negative
                # cases above. Uses the seed endpoint's `all: true`
                # bulk mode (reset + mark every step done + stamp
                # completed_at in a single call).
                for req_body in (
                    {"user_id": owner_uid_perm, "reset": True},
                    {"user_id": owner_uid_perm, "all": True},
                ):
                    r = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(req_body).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(r, timeout=30) as resp:
                        body_json = json.loads(resp.read().decode("utf-8"))
                    if not body_json.get("ok"):
                        raise AssertionError(
                            f"[all-done] seed call failed: {body_json}"
                        )
                if body_json.get("all") is not True:
                    raise AssertionError(
                        f"[all-done] seed did not report all=true: {body_json}"
                    )
                if not body_json.get("completed_at"):
                    raise AssertionError(
                        f"[all-done] seed did not return completed_at: {body_json}"
                    )
                # DB: three steps done, completed_at NOT NULL.
                prog_json = psql_scalar(
                    "SELECT COALESCE(onboarding_progress::text,'{}') "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                prog_obj = json.loads(prog_json or "{}")
                done_count = sum(
                    1 for s in ("profile", "company", "first_receipt")
                    if (prog_obj.get(s) or {}).get("done") is True
                )
                if done_count != 3:
                    errors.append(
                        f"[all-done] expected 3 steps done, got {done_count}; "
                        f"progress={prog_obj}"
                    )
                cat_not_null = psql_scalar(
                    "SELECT (onboarding_completed_at IS NOT NULL)::text "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                if (cat_not_null or "").strip().lower() not in ("t", "true"):
                    errors.append(
                        f"[all-done] onboarding_completed_at should be NOT NULL "
                        f"(got {cat_not_null!r})"
                    )
                cat_val = psql_scalar(
                    "SELECT COALESCE(onboarding_completed_at::text,'') "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                if not cat_val:
                    errors.append(
                        "[all-done] onboarding_completed_at value is empty"
                    )
                # Navigate to /dashboard/auto: MUST NOT redirect to
                # /onboarding/wizard, and kpi-auto-panel MUST render.
                await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                await owner_page2.goto(
                    f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                )
                await owner_page2.wait_for_timeout(1200)
                if "/onboarding/wizard" in owner_page2.url:
                    errors.append(
                        f"[all-done] /dashboard/auto redirected to wizard "
                        f"despite completed_at being set (url={owner_page2.url})"
                    )
                if not owner_page2.url.rstrip("/").endswith("/dashboard/auto"):
                    errors.append(
                        f"[all-done] /dashboard/auto final URL unexpected: "
                        f"{owner_page2.url}"
                    )
                try:
                    await owner_page2.wait_for_selector(
                        '[data-testid="kpi-auto-panel"]', timeout=10000
                    )
                except Exception as e:
                    errors.append(
                        f"[all-done] kpi-auto-panel did not render after "
                        f"completing all steps: {e}"
                    )
                await owner_page2.screenshot(
                    path=str(SHOTS / "3g_kpi_visible_all_done.png")
                )
                # 4a-non. Seed / reset edge cases:
                #  (a) reseeding a step already marked done is idempotent
                #      — done stays true and no stray fields appear.
                #  (b) a full reset clears both onboarding_progress and
                #      onboarding_completed_at atomically.
                #  (c) after reset → reseed all three, onboarding_completed_at
                #      is set again with a fresh timestamp (i.e. the guard
                #      re-arms rather than remembering the old completion).
                def _seed(body):
                    r = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps(body).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(r, timeout=30) as resp:
                        return json.loads(resp.read().decode("utf-8"))

                # (a) Re-seed "profile" while all three are already done.
                cat_before = psql_scalar(
                    "SELECT COALESCE(onboarding_completed_at::text,'') "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                reseed = _seed({"user_id": owner_uid_perm, "step": "profile"})
                if not reseed.get("ok"):
                    errors.append(f"[edge-reseed] failed: {reseed}")
                prog_json = psql_scalar(
                    "SELECT COALESCE(onboarding_progress::text,'{}') "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                prog_obj = json.loads(prog_json or "{}")
                done_count = sum(
                    1 for s in ("profile", "company", "first_receipt")
                    if (prog_obj.get(s) or {}).get("done") is True
                )
                if done_count != 3:
                    errors.append(
                        f"[edge-reseed] expected 3 done after re-seed, got "
                        f"{done_count}; progress={prog_obj}"
                    )
                stray = [
                    k for k in prog_obj.keys()
                    if k not in ("profile", "company", "first_receipt")
                ]
                if stray:
                    errors.append(
                        f"[edge-reseed] unexpected keys {stray!r} after re-seed"
                    )
                # (b) Reset — both fields must clear atomically.
                reset_resp = _seed({"user_id": owner_uid_perm, "reset": True})
                if not reset_resp.get("ok") or not reset_resp.get("reset"):
                    errors.append(f"[edge-reset] seed response wrong: {reset_resp}")
                prog_after_reset = psql_scalar(
                    "SELECT COALESCE(onboarding_progress::text,'{}') "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                if json.loads(prog_after_reset or "{}"):
                    errors.append(
                        f"[edge-reset] onboarding_progress not cleared: "
                        f"{prog_after_reset!r}"
                    )
                cat_after_reset = psql_scalar(
                    "SELECT (onboarding_completed_at IS NULL)::text "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                if (cat_after_reset or "").strip().lower() not in ("t", "true"):
                    errors.append(
                        f"[edge-reset] onboarding_completed_at not NULL after reset"
                    )
                # (c) Re-complete after reset — completed_at must be set to a
                # NEW timestamp (strictly greater than the pre-reset value).
                for s in ("profile", "company", "first_receipt"):
                    _seed({"user_id": owner_uid_perm, "step": s})
                cat_after_recomplete = psql_scalar(
                    "SELECT COALESCE(onboarding_completed_at::text,'') "
                    f"FROM public.profiles WHERE id = '{owner_uid_perm}'"
                )
                if not cat_after_recomplete:
                    errors.append(
                        "[edge-recomplete] onboarding_completed_at should be set "
                        "after re-completing the three steps, got empty"
                    )
                elif cat_before and cat_after_recomplete <= cat_before:
                    errors.append(
                        f"[edge-recomplete] onboarding_completed_at did not advance "
                        f"(before={cat_before!r}, after={cat_after_recomplete!r})"
                    )
                # And KPIs must still render — no lingering redirect from
                # a prior state.
                await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                await owner_page2.goto(
                    f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                )
                await owner_page2.wait_for_timeout(1000)
                if "/onboarding/wizard" in owner_page2.url:
                    errors.append(
                        f"[edge-recomplete] /dashboard/auto redirected to wizard "
                        f"after re-completion (url={owner_page2.url})"
                    )
                try:
                    await owner_page2.wait_for_selector(
                        '[data-testid="kpi-auto-panel"]', timeout=10000
                    )
                except Exception as e:
                    errors.append(
                        f"[edge-recomplete] kpi-auto-panel missing after re-completion: {e}"
                    )
                # Reset one more time so step 4b starts from a clean slate,
                # matching the flow it was written for.
                reset_req = urllib.request.Request(
                    f"{BASE}/api/public/test-seed-complete-onboarding",
                    data=json.dumps(
                        {"user_id": owner_uid_perm, "reset": True}
                    ).encode("utf-8"),
                    method="POST",
                    headers={
                        "Content-Type": "application/json",
                        "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                    },
                )
                with urllib.request.urlopen(reset_req, timeout=30) as resp:
                    resp.read()

                # 4b. Simulate wizard completion: mark the three required
                #     steps (profile / company / first_receipt) done. This
                #     is what setOnboardingStep() writes into
                #     profiles.onboarding_progress when the user submits
                #     each wizard page.
                owner_uid = owner_creds["user_id"]
                REQUIRED_STEPS = ("profile", "company", "first_receipt")
                for idx, step in enumerate(REQUIRED_STEPS):
                    req = urllib.request.Request(
                        f"{BASE}/api/public/test-seed-complete-onboarding",
                        data=json.dumps({"user_id": owner_uid, "step": step}).encode("utf-8"),
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "x-test-seed-token": os.environ["TEST_SEED_TOKEN"],
                        },
                    )
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        step_payload = json.loads(resp.read().decode("utf-8"))
                    print(
                        f"[diag] onboarding step {step}: "
                        f"{json.dumps({k: step_payload.get(k) for k in ('ok', 'step', 'completed_at')})}",
                        file=sys.stderr, flush=True,
                    )
                    if not step_payload.get("ok"):
                        errors.append(f"onboarding step {step} failed: {step_payload}")
                    # Assert immediately after each POST that this step is
                    # `done === true` in the DB before moving on. This
                    # catches a silently-accepted step that failed to
                    # persist, instead of surfacing it later as a redirect
                    # loop into /onboarding/wizard.
                    per_step_json = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid}'"
                    )
                    per_step_obj = json.loads(per_step_json or "{}")
                    if (per_step_obj.get(step) or {}).get("done") is not True:
                        errors.append(
                            f"onboarding_progress.{step}.done !== true right after POST: "
                            f"{per_step_obj.get(step)}"
                        )
                    # Partial-onboarding guard: after each intermediate
                    # step (i.e. NOT the final one), hitting the KPIs page
                    # must still redirect to /onboarding/wizard and must
                    # not render the panel. This proves the loader guard
                    # requires ALL three steps, not merely "at least one".
                    if idx < len(REQUIRED_STEPS) - 1:
                        await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                        await owner_page2.goto(
                            f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                        )
                        try:
                            await owner_page2.wait_for_url(
                                "**/onboarding/wizard", timeout=15000
                            )
                        except Exception as e:
                            errors.append(
                                f"/dashboard/auto did not redirect after only "
                                f"{idx + 1}/{len(REQUIRED_STEPS)} steps "
                                f"(done={step}, url={owner_page2.url}): {e}"
                            )
                        await owner_page2.wait_for_timeout(1000)
                        partial_kpi = await owner_page2.locator(
                            '[data-testid="kpi-auto-panel"]'
                        ).count()
                        if partial_kpi > 0:
                            errors.append(
                                f"KPI panel leaked with partial onboarding "
                                f"({idx + 1}/{len(REQUIRED_STEPS)} steps done, "
                                f"last={step}, url={owner_page2.url})"
                            )
                        await owner_page2.screenshot(
                            path=str(SHOTS / f"3b{idx}_kpi_blocked_partial_{step}.png")
                        )
                # After the third step, all three must be done AND
                # completed_at must be set.
                progress_json = psql_scalar(
                    "SELECT COALESCE(onboarding_progress::text,'{}') "
                    f"FROM public.profiles WHERE id = '{owner_uid}'"
                )
                progress_obj = json.loads(progress_json or "{}")
                all_done = True
                for step in REQUIRED_STEPS:
                    step_entry = progress_obj.get(step) or {}
                    if step_entry.get("done") is not True:
                        all_done = False
                        errors.append(
                            f"onboarding_progress.{step}.done !== true after fill "
                            f"(got {step_entry!r}); full progress={progress_obj}"
                        )
                completed_at = psql_scalar(
                    "SELECT COALESCE(onboarding_completed_at::text,'') "
                    f"FROM public.profiles WHERE id = '{owner_uid}'"
                )
                if not completed_at:
                    all_done = False
                    errors.append(
                        "profiles.onboarding_completed_at was not persisted "
                        "after simulated wizard completion"
                    )

                # 4c. Only if every precondition is truly satisfied do we
                #     let the owner reach the KPI dashboard. Otherwise the
                #     "dashboard loaded" assertion below would mask an
                #     onboarding-gate regression.
                if not all_done or not completed_at:
                    errors.append(
                        "skipping dashboard KPI check: onboarding preconditions not met "
                        f"(all_done={all_done}, completed_at={completed_at!r})"
                    )
                else:
                    await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                    await owner_page2.goto(
                        f"{BASE}/dashboard", wait_until="domcontentloaded"
                    )
                    try:
                        await owner_page2.wait_for_selector(
                            '[data-testid="dashboard-shell"]',
                            state="visible",
                            timeout=30000,
                        )
                    except Exception as e:
                        errors.append(f"dashboard-shell did not appear (active): {e}")
                    # Give the guard a moment; if it were still going to
                    # redirect it would have by now.
                    await owner_page2.wait_for_timeout(1500)
                    final_owner_url = owner_page2.url
                    if "/onboarding" in final_owner_url:
                        errors.append(
                            f"owner was still bounced to onboarding after completion: {final_owner_url}"
                        )
                    await owner_page2.screenshot(
                        path=str(SHOTS / "3_owner_dashboard_active.png")
                    )

                    # 4d. Idempotency + KPI reload:
                    #   - onboarding_completed_at must be set exactly once,
                    #     and reloading /dashboard/auto must NOT retrigger
                    #     onboarding (no bump to completed_at, no reset of
                    #     onboarding_progress, no redirect to the wizard).
                    completed_before = psql_scalar(
                        "SELECT COALESCE(onboarding_completed_at::text,'') "
                        f"FROM public.profiles WHERE id = '{owner_uid}'"
                    )
                    progress_before = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid}'"
                    )

                    await owner_page2.goto(f"{BASE}/", wait_until="domcontentloaded")
                    await owner_page2.goto(
                        f"{BASE}/dashboard/auto", wait_until="domcontentloaded"
                    )
                    try:
                        await owner_page2.wait_for_selector(
                            '[data-testid="kpi-auto-panel"]',
                            state="visible",
                            timeout=30000,
                        )
                    except Exception as e:
                        errors.append(f"kpi-auto-panel did not render post-onboarding: {e}")
                    # Full page reload — exercises the loader guard again.
                    await owner_page2.reload(wait_until="domcontentloaded")
                    try:
                        await owner_page2.wait_for_selector(
                            '[data-testid="kpi-auto-panel"]',
                            state="visible",
                            timeout=30000,
                        )
                    except Exception as e:
                        errors.append(f"kpi-auto-panel did not render after reload: {e}")
                    await owner_page2.wait_for_timeout(1500)
                    reloaded_url = owner_page2.url
                    if "/onboarding" in reloaded_url:
                        errors.append(
                            f"KPI reload bounced back into onboarding: {reloaded_url}"
                        )

                    completed_after = psql_scalar(
                        "SELECT COALESCE(onboarding_completed_at::text,'') "
                        f"FROM public.profiles WHERE id = '{owner_uid}'"
                    )
                    progress_after = psql_scalar(
                        "SELECT COALESCE(onboarding_progress::text,'{}') "
                        f"FROM public.profiles WHERE id = '{owner_uid}'"
                    )
                    if not completed_after:
                        errors.append(
                            "onboarding_completed_at was cleared by KPI reload"
                        )
                    elif completed_after != completed_before:
                        errors.append(
                            "onboarding_completed_at changed on KPI reload — "
                            f"expected idempotent write; before={completed_before!r} "
                            f"after={completed_after!r}"
                        )
                    if progress_after != progress_before:
                        errors.append(
                            "onboarding_progress mutated on KPI reload — "
                            f"before={progress_before} after={progress_after}"
                        )
                    await owner_page2.screenshot(
                        path=str(SHOTS / "3d_kpi_after_reload.png")
                    )
            await owner_ctx2.close()
        finally:
            await browser.close()
    return errors


def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if not token:
        print("SKIP: TEST_SEED_TOKEN not set")
        return 0
    if not os.environ.get("PGHOST"):
        print("SKIP: PGHOST not set (need psql for DB assertions)")
        return 0
    try:
        seed_payload = seed(token)
    except Exception as e:
        print(f"FAIL: seed error: {e}", file=sys.stderr)
        return 1
    errors = asyncio.run(run(seed_payload))
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: full signup → payment → approval → activation flow")
    return 0


if __name__ == "__main__":
    sys.exit(main())
