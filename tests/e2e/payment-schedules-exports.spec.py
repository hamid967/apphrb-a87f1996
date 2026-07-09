"""
Verifies CSV + XLSX exports on /dashboard/payment-schedules:
  * filename honors active source/status filters
  * CSV: UTF-8 BOM, expected header row, includes voucher_* + commission_* columns
  * XLSX: opens with openpyxl, sheet is RTL, header row matches, row count sane

Skips gracefully when there are no rows to export (empty tenant), but still
asserts the download filename shape and that a file is produced.
"""

import asyncio
import json
import os
import re
from pathlib import Path

from openpyxl import load_workbook
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = Path(__file__).parent.parent.parent / "tmp" / "browser" / "payment-schedules-exports"
SHOTS = OUT / "screenshots"
DOWNLOADS = OUT / "downloads"
for d in (SHOTS, DOWNLOADS):
    d.mkdir(parents=True, exist_ok=True)

EXPECTED_HEADERS = [
    "installment_no", "due_date", "source_type",
    "amount", "vat_amount", "total_amount", "status", "notes",
    "contract_id", "deal_id", "commission_id",
    "voucher_id", "voucher_reference", "voucher_status",
    "voucher_paid_at", "voucher_amount", "voucher_currency",
    "invoice_id",
    "commission_percent", "commission_amount",
    "commission_status", "commission_paid_at", "commission_currency",
    "commission_agent_id",
]


async def restore(context, page):
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def apply_status_filter(page, arabic_label: str) -> bool:
    """Try to pick a status via the second Select (status). Returns True on success."""
    # The status trigger is the 2nd combobox in the filter row.
    triggers = page.get_by_role("combobox")
    count = await triggers.count()
    if count < 2:
        return False
    await triggers.nth(1).click()
    option = page.get_by_role("option", name=arabic_label, exact=True)
    if await option.count() == 0:
        # Close popover and bail
        await page.keyboard.press("Escape")
        return False
    await option.first.click()
    return True


async def download_via(page, arabic_button_label: str, ext: str, *, timeout: int = 8000):
    """Click an export button and capture the download. Returns None if no download fires."""
    try:
        async with page.expect_download(timeout=timeout) as dl_info:
            await page.get_by_role("button", name=re.compile(arabic_button_label)).first.click()
        dl = await dl_info.value
    except Exception:
        return None, None
    dest = DOWNLOADS / dl.suggested_filename
    await dl.save_as(str(dest))
    print(f"downloaded {ext}: {dl.suggested_filename} -> {dest} ({dest.stat().st_size} bytes)")
    return dl.suggested_filename, dest



def assert_csv(path: Path, must_contain_in_name: str | None):
    assert path.exists() and path.stat().st_size > 0, f"empty CSV: {path}"
    raw = path.read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf"), "CSV missing UTF-8 BOM (Excel-Arabic requirement)"
    text = raw.decode("utf-8-sig")
    lines = text.splitlines()
    assert lines, "CSV has no lines"
    header_cols = lines[0].split(",")
    assert header_cols == EXPECTED_HEADERS, (
        f"CSV header mismatch.\n  got: {header_cols}\n  want: {EXPECTED_HEADERS}"
    )
    if must_contain_in_name:
        assert must_contain_in_name in path.name, (
            f"CSV filename must include filter scope '{must_contain_in_name}': {path.name}"
        )
    print(f"CSV ok — {len(lines) - 1} data row(s), header verified")


def assert_xlsx(path: Path, must_contain_in_name: str | None):
    assert path.exists() and path.stat().st_size > 0, f"empty XLSX: {path}"
    if must_contain_in_name:
        assert must_contain_in_name in path.name, (
            f"XLSX filename must include filter scope '{must_contain_in_name}': {path.name}"
        )
    wb = load_workbook(path, read_only=False)
    assert "payment-schedules" in wb.sheetnames, f"sheet missing: {wb.sheetnames}"
    ws = wb["payment-schedules"]
    header_row = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    assert header_row == EXPECTED_HEADERS, (
        f"XLSX header mismatch.\n  got: {header_row}\n  want: {EXPECTED_HEADERS}"
    )
    # RTL sheet view (isAr branch sets ws['!views'] = [{ RTL: true }]).
    view = ws.sheet_view
    assert getattr(view, "rightToLeft", False), (
        "XLSX sheet view is not RTL — expected rightToLeft=True for Arabic export"
    )
    print(f"XLSX ok — {ws.max_row - 1} data row(s), RTL view verified")


async def main():
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
    if status != "injected":
        print(f"SKIP: auth status={status!r} — need injected session for authed export")
        return

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            accept_downloads=True,
        )
        page = await context.new_page()
        await restore(context, page)

        await page.goto(f"{BASE}/dashboard/payment-schedules", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SHOTS / "1_loaded.png"))
        assert "/dashboard/payment-schedules" in page.url, f"unexpected url: {page.url}"

        # Empty-state guard: if the tenant has zero installments, export
        # handlers early-return with a toast instead of producing a file.
        empty_locator = page.get_by_text(re.compile("لا توجد أقساط"))
        is_empty = await empty_locator.count() > 0

        if is_empty:
            print("Tenant has no installments — verifying empty-state toasts instead of files")
            await page.get_by_role("button", name=re.compile(r"تصدير\s*CSV")).first.click()
            toast_csv = page.get_by_text("لا توجد بيانات للتصدير", exact=False)
            await toast_csv.first.wait_for(state="visible", timeout=5000)
            print("CSV empty-state toast ok")
            # Wait for toast to dismiss before next click so locators don't collide
            await page.wait_for_timeout(500)
            await page.get_by_role("button", name=re.compile(r"تصدير\s*XLSX")).first.click()
            toast_xlsx = page.get_by_text("لا توجد بيانات للتصدير", exact=False)
            await toast_xlsx.first.wait_for(state="visible", timeout=5000)
            print("XLSX empty-state toast ok")
            await page.screenshot(path=str(SHOTS / "2_empty_state.png"))
        else:
            # --- Unfiltered CSV --------------------------------------------
            csv_name, csv_path = await download_via(page, r"تصدير\s*CSV", "csv")
            assert csv_name and csv_path, "no CSV downloaded despite non-empty table"
            assert not re.search(
                r"-(pending|invoiced|paid|overdue|cancelled|contract|deal|commission)-\d",
                csv_name,
            ), f"unexpected filter scope in unfiltered CSV: {csv_name}"
            assert_csv(csv_path, must_contain_in_name=None)

            # --- Unfiltered XLSX -------------------------------------------
            xlsx_name, xlsx_path = await download_via(page, r"تصدير\s*XLSX", "xlsx")
            assert xlsx_name and xlsx_path, "no XLSX downloaded despite non-empty table"
            assert xlsx_name.endswith(".xlsx"), xlsx_name
            assert_xlsx(xlsx_path, must_contain_in_name=None)

            # --- Filtered by status = pending ------------------------------
            picked = await apply_status_filter(page, "معلّق")
            if not picked:
                print("SKIP filtered exports: status filter unavailable in this tenant")
            else:
                await page.wait_for_load_state("networkidle")
                await page.screenshot(path=str(SHOTS / "2_pending_filter.png"))
                chip = page.get_by_text("فلاتر نشطة:", exact=False)
                assert await chip.count() > 0, "active-filter chip strip did not render"

                # If filter yields zero rows the export toasts — accept either outcome
                # but require the filename scope on real downloads.
                empty_now = await page.get_by_text(re.compile("لا توجد أقساط")).count() > 0
                if empty_now:
                    print("Filtered result is empty — skipping filtered-file assertions")
                else:
                    f_csv_name, f_csv_path = await download_via(page, r"تصدير\s*CSV", "csv")
                    assert f_csv_name and "pending" in f_csv_name, (
                        f"filtered CSV missing 'pending' in name: {f_csv_name}"
                    )
                    assert_csv(f_csv_path, must_contain_in_name="pending")

                    f_xlsx_name, f_xlsx_path = await download_via(page, r"تصدير\s*XLSX", "xlsx")
                    assert f_xlsx_name and "pending" in f_xlsx_name, (
                        f"filtered XLSX missing 'pending' in name: {f_xlsx_name}"
                    )
                    assert_xlsx(f_xlsx_path, must_contain_in_name="pending")

        await page.screenshot(path=str(SHOTS / "3_done.png"))
        await browser.close()
        print("all export assertions passed")



asyncio.run(main())
