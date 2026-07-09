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
    email = os.environ.get("E2E_ADMIN_EMAIL", "hamid@hrhbs.com")
    password = require_env("E2E_ADMIN_PASSWORD")
    base_url = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")

    ref = project_ref(supabase_url)
    storage_key = f"sb-{ref}-auth-token"

    session = sign_in(supabase_url, anon_key, email, password)
    if "access_token" not in session:
        sys.exit(f"ERROR: unexpected sign-in response: {session}")

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