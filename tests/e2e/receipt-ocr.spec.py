"""
E2E: upload a test receipt, verify OCR extracts merchant/amount/date correctly
inside the onboarding form (renders in the results grid).

Skips if TEST_SEED_TOKEN missing. OCR uses the Lovable AI Gateway
(google/gemini-2.5-flash) via the ocrReceipt server function.
"""
import asyncio, json, os, sys, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/receipt-ocr"); SHOTS.mkdir(parents=True, exist_ok=True)

def _env():
    env = {}
    for p in (Path(".env"), Path(".env.local")):
        if not p.exists(): continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k,v = line.split("=",1); env[k.strip()] = v.strip().strip('"').strip("'")
    return env

E = _env()
URL = os.environ.get("VITE_SUPABASE_URL") or E.get("VITE_SUPABASE_URL")
KEY = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or E.get("VITE_SUPABASE_PUBLISHABLE_KEY")
REF = (os.environ.get("VITE_SUPABASE_PROJECT_ID") or E.get("VITE_SUPABASE_PROJECT_ID")
       or (URL.split("//",1)[-1].split(".",1)[0] if URL else ""))
TOKEN = os.environ.get("TEST_SEED_TOKEN") or E.get("TEST_SEED_TOKEN")

# Fixture receipt values — must round-trip via OCR.
MERCHANT = "AQARI TEST STORE"
AMOUNT = "125.50"
CURRENCY = "SAR"
DATE = "2026-07-07"

def report(name, ok, detail=""):
    print(("[PASS] " if ok else "[FAIL] ") + name + ((" — "+detail) if detail else ""),
          file=sys.stderr, flush=True)

def build_receipt(path: Path) -> None:
    """Render a clean, high-contrast receipt image with legible text."""
    W, H = 720, 900
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    # Try DejaVu (bundled with Pillow / most Linux images), fall back to default.
    try:
        big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
        med = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        reg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    except Exception:
        big = med = reg = ImageFont.load_default()
    y = 40
    d.text((W//2 - 200, y), MERCHANT, fill="black", font=big); y += 80
    d.text((60, y), "Riyadh, Saudi Arabia", fill="black", font=reg); y += 50
    d.line([(40,y),(W-40,y)], fill="black", width=2); y += 30
    d.text((60, y), f"Date: {DATE}", fill="black", font=med); y += 60
    d.text((60, y), "Invoice #: TST-000123", fill="black", font=reg); y += 60
    d.line([(40,y),(W-40,y)], fill="black", width=1); y += 40
    d.text((60, y), "Property mgmt subscription", fill="black", font=reg); y += 50
    d.text((60, y), "1 x monthly plan", fill="black", font=reg); y += 80
    d.line([(40,y),(W-40,y)], fill="black", width=2); y += 30
    d.text((60, y), "TOTAL:", fill="black", font=big)
    d.text((360, y), f"{AMOUNT} {CURRENCY}", fill="black", font=big); y += 90
    d.text((60, y), "Payment method: Bank transfer", fill="black", font=reg); y += 50
    d.text((60, y), "Thank you!", fill="black", font=reg)
    img.save(path, "PNG")

def seed():
    req = urllib.request.Request(f"{BASE}/api/public/test-seed-full-signup-flow",
        method="POST", headers={"x-test-seed-token": TOKEN, "content-type":"application/json"}, data=b"{}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

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
    if not TOKEN:
        print("skip: no TEST_SEED_TOKEN"); return 0
    receipt_path = SHOTS / "fixture-receipt.png"
    build_receipt(receipt_path)
    report(f"fixture built at {receipt_path.name}", receipt_path.exists())

    owner = seed()["credentials"]["owner"]
    failures = 0

    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width":1280,"height":1800})
        page = await ctx.new_page()
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        await page.goto(BASE+"/", wait_until="domcontentloaded")
        r = await sign_in(page, owner["email"], owner["password"])
        report("login", r.get("ok")); 
        if not r.get("ok"): return 1

        await page.goto(BASE+"/onboarding/welcome", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS/"1_welcome.png"))

        # The file input is hidden inside <label>; setInputFiles bypasses visibility.
        file_input = page.locator('input[type="file"][accept*="image"]').first
        await file_input.wait_for(state="attached", timeout=8000)
        await file_input.set_input_files(str(receipt_path))
        report("uploaded receipt fixture", True)

        # Wait for OCR round-trip to complete: the busy label "جارٍ المعالجة…"
        # disappears and "اختر ملف الإيصال" is back on the trigger.
        try:
            await page.wait_for_function(
                "() => !document.body.textContent.includes('جارٍ المعالجة')",
                timeout=180_000,
            )
        except Exception as e:
            await page.screenshot(path=str(SHOTS/"err_no_fields.png"))
            report("ocr completed within 180s", False, str(e)[:120])
            return 1
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(SHOTS/"2_ocr_result.png"))

        # Extract the 4 Field values ("التاجر", "المبلغ", "التاريخ", "العملة").
        fields = await page.evaluate("""() => {
          const labels = ["التاجر","المبلغ","التاريخ","العملة"];
          const out = {}; window.__dbg=[];
          for (const l of labels) {
            // Any element whose trimmed text equals the label (children may be text nodes).
            const labelDiv = Array.from(document.querySelectorAll('*'))
              .find(n => (n.textContent||'').trim()===l && !Array.from(n.children).some(c=>c.textContent && c.textContent.trim()===l));
            let value = null;
            if (labelDiv && labelDiv.nextElementSibling) {
              value = (labelDiv.nextElementSibling.textContent||'').trim() || null;
            }
            out[l] = value; window.__dbg.push({l, labelFound: !!labelDiv, sibling: labelDiv?.nextElementSibling?.outerHTML?.slice(0,120)});
          }
          return out;
        }""")
        dbg=await page.evaluate("()=>window.__dbg"); print("[dbg]", dbg, file=__import__("sys").stderr); print("[ocr] fields:", json.dumps(fields, ensure_ascii=False), file=sys.stderr)

        merchant_ok = fields.get("التاجر") and MERCHANT.lower() in fields["التاجر"].lower()
        amount_ok = fields.get("المبلغ") and (AMOUNT in fields["المبلغ"] or "125" in fields["المبلغ"])
        date_ok = fields.get("التاريخ") == DATE
        currency_ok = fields.get("العملة") == CURRENCY

        report(f"merchant contains '{MERCHANT}' -> got '{fields.get('التاجر')}'", merchant_ok)
        report(f"amount contains '{AMOUNT}' -> got '{fields.get('المبلغ')}'", amount_ok)
        report(f"date == '{DATE}' -> got '{fields.get('التاريخ')}'", date_ok)
        report(f"currency == '{CURRENCY}' -> got '{fields.get('العملة')}'", currency_ok)

        for ok in (merchant_ok, amount_ok, date_ok, currency_ok):
            failures += 0 if ok else 1

        report(f"no page errors ({len(page_errors)})", not page_errors,
               "; ".join(page_errors[:2]))
        if page_errors: failures += 1

        await b.close()
    print(f"[done] failures={failures}", file=sys.stderr)
    return 0 if failures==0 else 1

sys.exit(asyncio.run(main()))
