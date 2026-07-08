"""
RTL visual + behavioral check for payment pages.

Steps:
 1. Sign in as seeded owner.
 2. Verify LanguageSwitcher on public /auth page toggles dir rtl<->ltr
    without errors and persists selection to localStorage.
 3. Navigate to payment routes; if org-gated (redirects to /onboarding),
    record the redirect but still verify <html dir="rtl"> is applied and
    no page errors were raised.
 4. Capture screenshots of each state under /tmp/browser/rtl-payments/.
"""
import asyncio, json, os, subprocess, sys, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/rtl-payments"); SHOTS.mkdir(parents=True, exist_ok=True)

def _env_file():
    env = {}
    for p in (Path(".env"), Path(".env.local")):
        if not p.exists(): continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line: continue
            k,v = line.split("=",1); env[k.strip()] = v.strip().strip('"').strip("'")
    return env

E = _env_file()
URL = os.environ.get("VITE_SUPABASE_URL") or E.get("VITE_SUPABASE_URL")
KEY = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or E.get("VITE_SUPABASE_PUBLISHABLE_KEY")
REF = (os.environ.get("VITE_SUPABASE_PROJECT_ID") or E.get("VITE_SUPABASE_PROJECT_ID")
       or (URL.split("//",1)[-1].split(".",1)[0] if URL else ""))
TOKEN = os.environ.get("TEST_SEED_TOKEN") or E.get("TEST_SEED_TOKEN")

def seed():
    req = urllib.request.Request(f"{BASE}/api/public/test-seed-full-signup-flow",
        method="POST", headers={"x-test-seed-token": TOKEN, "content-type":"application/json"}, data=b"{}")
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())

def report(name, ok, detail=""):
    print(("[PASS] " if ok else "[FAIL] ")+name+((" — "+detail) if detail else ""), file=sys.stderr, flush=True)

async def sign_in(page, email, pw):
    return await page.evaluate("""async ({url,key,ref,email,password}) => {
        const r = await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',
          headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},
          body:JSON.stringify({email,password})});
        const b = await r.json();
        if(!r.ok||!b.access_token) return {ok:false,b};
        window.localStorage.setItem('sb-'+ref+'-auth-token', JSON.stringify(b));
        return {ok:true};
    }""", {"url":URL,"key":KEY,"ref":REF,"email":email,"password":pw})

async def main():
    if not TOKEN: print("skip: no TEST_SEED_TOKEN"); return 0
    s = seed(); owner = s["credentials"]["owner"]
    failures = 0
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width":1280,"height":1800})
        page = await ctx.new_page()
        await page.goto(BASE+"/", wait_until="domcontentloaded")

        # Collect page errors globally.
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        # ---- language toggle on /auth (public, signed OUT) ----
        await page.goto(BASE+"/auth", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        dir1 = await page.evaluate("document.documentElement.getAttribute('dir')")
        lang1 = await page.evaluate("document.documentElement.getAttribute('lang')")
        await page.screenshot(path=str(SHOTS/"1_auth_initial.png"))

        try:
            btn = page.locator("button:has-text('English'), button:has-text('العربية')").first
            await btn.wait_for(state="visible", timeout=8000)
            initial_text = (await btn.inner_text()).strip()
            await btn.click()
            await page.wait_for_timeout(1200)
            dir2 = await page.evaluate("document.documentElement.getAttribute('dir')")
            lang2 = await page.evaluate("document.documentElement.getAttribute('lang')")
            switched = (dir1 != dir2) and (lang1 != lang2)
            report(f"toggle {lang1}->{lang2} dir {dir1}->{dir2} (btn='{initial_text}')", switched)
            failures += 0 if switched else 1
            await page.screenshot(path=str(SHOTS/"2_auth_toggled.png"))

            persisted = await page.evaluate("localStorage.getItem('aqary-lang')")
            report(f"persist aqary-lang={persisted}", persisted==lang2)
            failures += 0 if persisted==lang2 else 1

            # End in Arabic for RTL verification below.
            if lang2 != "ar":
                await page.locator("button:has-text('English'), button:has-text('العربية')").first.click(timeout=5000)
                await page.wait_for_timeout(1200)
            dir_ar = await page.evaluate("document.documentElement.getAttribute('dir')")
            report(f"final RTL on /auth dir={dir_ar}", dir_ar=="rtl")
            failures += 0 if dir_ar=="rtl" else 1
        except Exception as e:
            report("language toggle", False, str(e)[:160]); failures += 1

        # ---- now sign in for the payment-route checks ----
        r = await sign_in(page, owner["email"], owner["password"])
        report("login", r.get("ok"), "" if r.get("ok") else json.dumps(r))
        if not r.get("ok"): return 1

        # ---- payment routes: verify RTL + no page errors even when redirected ----
        for path, slug in [
            ("/dashboard/payments","dashboard_payments"),
            ("/dashboard/settings/billing","dashboard_billing"),
            ("/portal/invoices","portal_invoices"),
            ("/portal/billing","portal_billing"),
        ]:
            errs_before = len(errs)
            await page.goto(BASE+path, wait_until="domcontentloaded")
            await page.wait_for_timeout(1800)
            d = await page.evaluate("document.documentElement.getAttribute('dir')")
            new_errs = errs[errs_before:]
            ok = (d=="rtl") and not new_errs
            report(f"{path} dir={d} url={page.url.replace(BASE,'')} errs={len(new_errs)}", ok,
                   "; ".join(new_errs[:1]))
            failures += 0 if ok else 1
            await page.screenshot(path=str(SHOTS/f"3_{slug}_ar.png"))

        await b.close()
    print(f"[done] failures={failures}", file=sys.stderr)
    return 0 if failures==0 else 1

sys.exit(asyncio.run(main()))
