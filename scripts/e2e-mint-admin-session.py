#!/usr/bin/env python3
"""
Mint a Supabase session for the E2E super-admin and write everything
Playwright needs to restore it as `storageState`, so admin tests skip the
/auth redirect entirely.

Reads (env):
  VITE_SUPABASE_URL              — project URL
  VITE_SUPABASE_PUBLISHABLE_KEY  — anon/publishable key
  E2E_ADMIN_EMAIL                — defaults to hamid@hrhbs.com
  E2E_ADMIN_PASSWORD             — required
  BASE_URL                       — defaults to http://localhost:8080

Writes to tests/.auth/ (gitignored):
  admin.session.json  — raw Supabase session
  admin.cookies.json  — @supabase/ssr cookie array
  admin.storage.json  — Playwright storageState (cookies + localStorage)
  admin.env           — shell exports for LOVABLE_BROWSER_SUPABASE_*

Print the `source` line to activate:
  eval "$(python3 scripts/e2e-mint-admin-session.py --print-source)"
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "tests" / ".auth"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"ERROR: missing env var {name}")
    return v


def project_ref(supabase_url: str) -> str:
    # https://<ref>.supabase.co  → <ref>
    host = urlparse(supabase_url).hostname or ""
    return host.split(".")[0]


def sign_in(supabase_url: str, anon_key: str, email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        method="POST",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"ERROR: sign-in failed ({e.code}): {body}")


def admin_mint_via_magiclink(
    supabase_url: str, service_role_key: str, anon_key: str, email: str,
) -> dict:
    """Fallback: mint a session for `email` using the service-role Admin API.

    1) POST /auth/v1/admin/generate_link {type:magiclink,email}
       → returns { hashed_token, ... }
    2) POST /auth/v1/verify {type:magiclink, token_hash}
       → returns a full session (access_token, refresh_token, expires_at, user).

    This does NOT require the user's password and does NOT modify the user.
    Requires a super-admin user to already exist in auth.users.
    """
    # 1) generate_link
    gen_req = urllib.request.Request(
        f"{supabase_url}/auth/v1/admin/generate_link",
        method="POST",
        data=json.dumps({"type": "magiclink", "email": email}).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        },
    )
    try:
        with urllib.request.urlopen(gen_req, timeout=15) as r:
            gen = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"ERROR: admin generate_link failed ({e.code}): {body}")

    token_hash = (
        gen.get("hashed_token")
        or gen.get("properties", {}).get("hashed_token")
    )
    if not token_hash:
        sys.exit(f"ERROR: generate_link missing hashed_token: {gen}")

    # 2) verify (exchange token_hash for a session)
    ver_req = urllib.request.Request(
        f"{supabase_url}/auth/v1/verify",
        method="POST",
        data=json.dumps({"type": "magiclink", "token_hash": token_hash}).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": anon_key,
        },
    )
    try:
        with urllib.request.urlopen(ver_req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"ERROR: verify magiclink failed ({e.code}): {body}")

def _pgrst(supabase_url: str, service_role_key: str, method: str, path: str,
           body: dict | list | None = None, prefer: str | None = None) -> tuple[int, str]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{supabase_url}{path}", method=method, data=data, headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def ensure_test_user(supabase_url: str, service_role_key: str, email: str,
                     role: str) -> str:
    """Create the E2E user if missing (email_confirm=true) and grant `role`.
    Returns the auth user id. Idempotent."""
    # 1) Look up user
    from urllib.parse import quote
    code, body = _pgrst(
        supabase_url, service_role_key, "GET",
        f"/auth/v1/admin/users?email={quote(email)}",
    )
    user_id = None
    email_confirmed = False
    if code == 200:
        try:
            users = json.loads(body).get("users", [])
            match = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
            if match:
                user_id = match.get("id")
                email_confirmed = bool(match.get("email_confirmed_at"))
        except Exception:
            pass
    # 2) Create if missing
    if not user_id:
        code, body = _pgrst(
            supabase_url, service_role_key, "POST",
            "/auth/v1/admin/users",
            body={"email": email, "email_confirm": True,
                  "user_metadata": {"e2e": True, "display_name": "E2E Perf Bot"}},
        )
        if code not in (200, 201):
            sys.exit(f"ERROR: could not create E2E user ({code}): {body}")
        try:
            parsed = json.loads(body)
            user_id = parsed.get("id")
            email_confirmed = bool(parsed.get("email_confirmed_at"))
        except Exception:
            user_id = None
        if not user_id:
            sys.exit(f"ERROR: unexpected create-user response: {body}")
    # 2b) Force-confirm the email so magiclink verify accepts the token.
    if not email_confirmed:
        code, body = _pgrst(
            supabase_url, service_role_key, "PUT",
            f"/auth/v1/admin/users/{user_id}",
            body={"email_confirm": True},
        )
        if code not in (200, 201):
            sys.exit(f"ERROR: could not confirm E2E user email ({code}): {body}")
        if code not in (200, 201):
            sys.exit(f"ERROR: could not create E2E user ({code}): {body}")
        try:
            user_id = json.loads(body).get("id")
        except Exception:
            user_id = None
        if not user_id:
            sys.exit(f"ERROR: unexpected create-user response: {body}")
    # 3) Grant role (idempotent via ON CONFLICT-like Prefer)
    code, body = _pgrst(
        supabase_url, service_role_key, "POST",
        "/rest/v1/user_roles",
        body={"user_id": user_id, "role": role},
        prefer="resolution=merge-duplicates,return=minimal",
    )
    # 409 or 200/201 → OK; treat other codes as fatal only if not "already exists"
    if code not in (200, 201, 204, 409):
        # Some deployments return 400 with duplicate-key text; tolerate that.
        if "duplicate" not in body.lower() and "already exists" not in body.lower():
            sys.exit(f"ERROR: could not grant {role} to E2E user ({code}): {body}")
    return user_id



def to_ssr_cookie_value(session: dict) -> str:
    """@supabase/ssr encodes the session as `base64-<b64url(JSON)>`."""
    payload = json.dumps(session, separators=(",", ":")).encode()
    b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return "base64-" + b64


def build_cookies(session: dict, ref: str, base_url: str) -> list[dict]:
    host = urlparse(base_url).hostname or "localhost"
    val = to_ssr_cookie_value(session)
    expires = int(time.time()) + 60 * 60 * 8  # 8h
    name = f"sb-{ref}-auth-token"
    # Split at 3072-byte boundary the way @supabase/ssr does, to survive cookie caps.
    CHUNK = 3072
    if len(val) <= CHUNK:
        chunks = [(name, val)]
    else:
        chunks = [(f"{name}.{i}", val[i * CHUNK : (i + 1) * CHUNK])
                  for i in range((len(val) + CHUNK - 1) // CHUNK)]
    return [
        {
            "name": cname,
            "value": cval,
            "domain": host,
            "path": "/",
            "expires": expires,
            "httpOnly": False,
            "secure": host != "localhost",
            "sameSite": "Lax",
        }
        for cname, cval in chunks
    ]


def build_storage_state(session: dict, storage_key: str, cookies: list[dict],
                        base_url: str) -> dict:
    origin = base_url.rstrip("/")
    return {
        "cookies": [
            {**c, "url": origin} if "url" not in c else c for c in cookies
        ],
        "origins": [
            {
                "origin": origin,
                "localStorage": [
                    {"name": storage_key, "value": json.dumps(session)},
                ],
            }
        ],
    }


def main() -> int:
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / ".env.local")

    print_source = "--print-source" in sys.argv

    supabase_url = require_env("VITE_SUPABASE_URL").rstrip("/")
    anon_key = require_env("VITE_SUPABASE_PUBLISHABLE_KEY")
    default_email = "e2e-perf@aqari.test" if os.environ.get("SUPABASE_SERVICE_ROLE_KEY") else "hamid@hrhbs.com"
    email = os.environ.get("E2E_TEST_EMAIL") or os.environ.get("E2E_ADMIN_EMAIL", default_email)
    password = os.environ.get("E2E_ADMIN_PASSWORD")
    service_role = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    role = os.environ.get("E2E_TEST_ROLE", "admin")
    base_url = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")

    ref = project_ref(supabase_url)
    storage_key = f"sb-{ref}-auth-token"

    if password:
        source = "password"
        session = sign_in(supabase_url, anon_key, email, password)
    elif service_role:
        # Ensure a dedicated test user with the requested role exists — no
        # real super-admin credentials needed.
        ensure_test_user(supabase_url, service_role, email, role)
        source = f"admin-magiclink ({email}, role={role})"
        session = admin_mint_via_magiclink(supabase_url, service_role, anon_key, email)
    else:
        sys.exit(
            "ERROR: need either E2E_ADMIN_PASSWORD (password grant) "
            "or SUPABASE_SERVICE_ROLE_KEY (admin magiclink fallback)."
        )
    if "access_token" not in session:
        sys.exit(f"ERROR: unexpected sign-in response ({source}): {session}")

    cookies = build_cookies(session, ref, base_url)
    storage = build_storage_state(session, storage_key, cookies, base_url)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "admin.session.json").write_text(json.dumps(session, indent=2))
    (OUT_DIR / "admin.cookies.json").write_text(json.dumps(cookies, indent=2))
    (OUT_DIR / "admin.storage.json").write_text(json.dumps(storage, indent=2))

    # Shell exports for the sandbox / CI pattern that reads LOVABLE_BROWSER_SUPABASE_*.
    env_lines = [
        "# Generated by scripts/e2e-mint-admin-session.py — do NOT commit.",
        f"export LOVABLE_BROWSER_AUTH_STATUS='injected'",
        f"export LOVABLE_BROWSER_SUPABASE_STORAGE_KEY={json.dumps(storage_key)}",
        f"export LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN={json.dumps(session['access_token'])}",
        f"export LOVABLE_BROWSER_SUPABASE_SESSION_JSON={json.dumps(json.dumps(session))}",
        f"export LOVABLE_BROWSER_SUPABASE_COOKIES_JSON={json.dumps(json.dumps(cookies))}",
    ]
    env_text = "\n".join(env_lines) + "\n"
    (OUT_DIR / "admin.env").write_text(env_text)

    if print_source:
        sys.stdout.write(env_text)
        return 0

    exp = session.get("expires_at")
    when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(exp)) if exp else "?"
    print(f"Minted session for {email}")
    print(f"  storage key : {storage_key}")
    print(f"  expires at  : {when}")
    print(f"  wrote       : {OUT_DIR}/admin.{{session,cookies,storage,env}}.json|env")
    print()
    print("Activate in this shell:")
    print("  eval \"$(python3 scripts/e2e-mint-admin-session.py --print-source)\"")
    print("Or point Playwright at:  tests/.auth/admin.storage.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())