"""
Cross-company RLS E2E for expense_batches / expense_claims.

Verifies that an authenticated owner in Company A cannot see (or mutate)
expense_batches or expense_claims that belong to Company B via the Data API
(PostgREST), even when they know the target row IDs. Also asserts positive
controls (the owner CAN read their own company's rows) so the negatives
aren't caused by a broken query.

Skips (exit 0) when TEST_SEED_TOKEN or PGHOST is missing.

Run:
  python3 tests/e2e/expense-cross-org-rls.spec.py
"""
import asyncio
import importlib.util
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
SHOTS = Path("/tmp/browser/expense-cross-org-rls")
SHOTS.mkdir(parents=True, exist_ok=True)

# Deterministic UUIDs so the seed is idempotent under psql select+insert only.
# NOTE: ORG_B.created_by MUST be a different auth user than the owner under
# test, otherwise the `handle_new_organization` trigger auto-adds the owner
# as a member of ORG_B and defeats the whole test. We use the super_admin
# user (also created by the seed endpoint) as ORG_B.created_by.
ORG_A = "aaaaaaaa-e2e2-4a00-8a00-000000000a02"
ORG_B = "bbbbbbbb-e2e2-4b00-8b00-000000000b02"
BATCH_A = "aaaaaaaa-e2e2-4a00-8a00-0000000ba002"
BATCH_B = "bbbbbbbb-e2e2-4b00-8b00-0000000bb002"
CLAIM_A = "aaaaaaaa-e2e2-4a00-8a00-0000000ca002"
CLAIM_B = "bbbbbbbb-e2e2-4b00-8b00-0000000cb002"


def psql(sql: str) -> str:
    return subprocess.check_output(["psql", "-Atc", sql], text=True).strip()


def seed_orgs(owner_uid: str, foreign_uid: str) -> None:
    psql(f"""
      INSERT INTO organizations (id, name, slug, created_by)
      VALUES
        ('{ORG_A}', 'E2E Cross-Org A', 'e2e-cross-org-a-{owner_uid[:8]}', '{owner_uid}'),
        ('{ORG_B}', 'E2E Cross-Org B', 'e2e-cross-org-b-{foreign_uid[:8]}', '{foreign_uid}')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO organization_members (org_id, user_id, role)
      VALUES ('{ORG_A}', '{owner_uid}', 'owner')
      ON CONFLICT DO NOTHING;

      -- Owner is NOT a member of ORG_B. Do not insert a membership row for
      -- them; that is the whole point of the test.

      INSERT INTO expense_batches (id, org_id, batch_number, title, batch_type, status, total_amount)
      VALUES
        ('{BATCH_A}', '{ORG_A}', 'E2E-XORG-A-001', 'Cross-org A batch', 'trip', 'submitted', 100),
        ('{BATCH_B}', '{ORG_B}', 'E2E-XORG-B-001', 'Cross-org B batch', 'trip', 'submitted', 200)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO expense_claims (id, org_id, claim_number, title, amount, status, batch_id)
      VALUES
        ('{CLAIM_A}', '{ORG_A}', 'E2E-XORG-CA-001', 'Claim A', 100, 'submitted', '{BATCH_A}'),
        ('{CLAIM_B}', '{ORG_B}', 'E2E-XORG-CB-001', 'Claim B', 200, 'submitted', '{BATCH_B}')
      ON CONFLICT (id) DO NOTHING;
    """)


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


def result(name, ok, detail=""):
    tag = "[PASS]" if ok else "[FAIL]"
    print(f"{tag} {name}{(' — ' + detail) if detail else ''}")
    return ok


async def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if not token:
        print("[SKIP] TEST_SEED_TOKEN not set"); return 0
    if not os.environ.get("PGHOST"):
        print("[SKIP] PGHOST not set"); return 0
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[SKIP] SUPABASE env missing"); return 0

    seeded = rs.seed(token)
    owner = seeded["credentials"]["owner"]
    owner_uid = owner["user_id"]
    foreign_uid = seeded["credentials"]["super_admin"]["user_id"]

    seed_orgs(owner_uid, foreign_uid)

    passes = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")

        s = await rs.sign_in(page, owner["email"], owner["password"])
        if not s.get("ok"):
            print("[FAIL] owner sign-in", s); await browser.close(); return 1
        bearer = s["access_token"]

        # ----- Positive controls: owner sees org_a rows -----
        r = await rest(page, "GET", f"/rest/v1/expense_batches?id=eq.{BATCH_A}&select=id,org_id", bearer)
        passes.append(result("positive: read own org batch",
            r["status"] == 200 and isinstance(r["body"], list) and len(r["body"]) == 1,
            f"status={r['status']} rows={len(r['body']) if isinstance(r['body'], list) else '?'}"))

        r = await rest(page, "GET", f"/rest/v1/expense_claims?id=eq.{CLAIM_A}&select=id,org_id", bearer)
        passes.append(result("positive: read own org claim",
            r["status"] == 200 and isinstance(r["body"], list) and len(r["body"]) == 1))

        # ----- Cross-org SELECT is filtered by RLS -----
        r = await rest(page, "GET", f"/rest/v1/expense_batches?id=eq.{BATCH_B}&select=id,org_id", bearer)
        passes.append(result("cross-org batch by id → empty",
            r["status"] == 200 and r["body"] == [], f"status={r['status']} body={r['body']!r}"))

        r = await rest(page, "GET", f"/rest/v1/expense_batches?org_id=eq.{ORG_B}&select=id", bearer)
        passes.append(result("cross-org batches by org_id → empty",
            r["status"] == 200 and r["body"] == [], f"body={r['body']!r}"))

        r = await rest(page, "GET", f"/rest/v1/expense_claims?id=eq.{CLAIM_B}&select=id,org_id", bearer)
        passes.append(result("cross-org claim by id → empty",
            r["status"] == 200 and r["body"] == [], f"body={r['body']!r}"))

        r = await rest(page, "GET", f"/rest/v1/expense_claims?org_id=eq.{ORG_B}&select=id", bearer)
        passes.append(result("cross-org claims by org_id → empty",
            r["status"] == 200 and r["body"] == [], f"body={r['body']!r}"))

        r = await rest(page, "GET", f"/rest/v1/expense_claims?batch_id=eq.{BATCH_B}&select=id", bearer)
        passes.append(result("cross-org claims by batch_id → empty",
            r["status"] == 200 and r["body"] == [], f"body={r['body']!r}"))

        # ----- Cross-org UPDATE is silently zero-rows (RLS filters WHERE) -----
        r = await rest(page, "PATCH",
            f"/rest/v1/expense_batches?id=eq.{BATCH_B}",
            bearer,
            body={"rejection_reason": "hacked"},
            prefer="return=representation")
        passes.append(result("cross-org batch PATCH → 0 rows",
            r["status"] in (200, 204) and (r["body"] == [] or r["body"] is None),
            f"status={r['status']} body={r['body']!r}"))

        r = await rest(page, "PATCH",
            f"/rest/v1/expense_claims?id=eq.{CLAIM_B}",
            bearer,
            body={"rejection_reason": "hacked"},
            prefer="return=representation")
        passes.append(result("cross-org claim PATCH → 0 rows",
            r["status"] in (200, 204) and (r["body"] == [] or r["body"] is None),
            f"status={r['status']} body={r['body']!r}"))

        # ----- Verify org_b rows in DB are UNCHANGED (bypass RLS with psql) -----
        rr = psql(f"SELECT COALESCE(rejection_reason,'') FROM expense_batches WHERE id='{BATCH_B}'")
        passes.append(result("org_b batch untouched in DB", rr == "", f"got={rr!r}"))
        rr = psql(f"SELECT COALESCE(rejection_reason,'') FROM expense_claims WHERE id='{CLAIM_B}'")
        passes.append(result("org_b claim untouched in DB", rr == "", f"got={rr!r}"))

        # ----- Cross-org INSERT into org_b is blocked (no membership) -----
        r = await rest(page, "POST",
            "/rest/v1/expense_batches",
            bearer,
            body={"org_id": ORG_B, "batch_number": "E2E-XORG-INJECT",
                  "title": "injected", "batch_type": "trip", "status": "draft",
                  "submitted_by": owner_uid},
            prefer="return=representation")
        passes.append(result("cross-org batch INSERT rejected",
            r["status"] in (401, 403) or (
                r["status"] == 200 and r["body"] == []),
            f"status={r['status']} body={str(r['body'])[:120]}"))

        await page.screenshot(path=str(SHOTS / "final.png"))
        await browser.close()

    ok = all(passes)
    print(f"\n[{'OK' if ok else 'FAIL'}] {sum(passes)}/{len(passes)} assertions passed")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
