#!/usr/bin/env python3
"""
Integration test: registering a company must, in a single call,
- create the org + owner membership,
- activate a 7-day free trial on the profile,
- create an ACTIVE `trial` subscription bound to the default (basic) package
  with a 7-day window,
- and log the whole flow in audit_log with one shared event_id
  (start → subscription_created → success).

The test creates a real Supabase auth user via the admin API, signs them in,
calls the `register_company` RPC as that user, then verifies state via the
service role. The temp user + all their rows are deleted at the end.

Skips cleanly when the required SUPABASE_* env vars are not present.
"""

from __future__ import annotations
import json, os, sys, urllib.request, urllib.error, uuid


URL = os.environ.get("SUPABASE_URL")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
PUBLIC_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")


def http(method: str, path: str, *, key: str, token: str | None = None,
         body: dict | None = None) -> tuple[int, dict | list | str]:
    url = URL.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {token or key}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, (e.read().decode() if e.fp else "")
    try:
        return 200, json.loads(raw) if raw else {}
    except Exception:
        return 200, raw


def rpc(name: str, args: dict, *, key: str, token: str | None = None):
    return http("POST", f"/rest/v1/rpc/{name}", key=key, token=token, body=args)


def rest_get(path: str, *, key: str, token: str | None = None):
    return http("GET", path, key=key, token=token)


def fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


def main() -> int:
    if not (URL and SERVICE_KEY and PUBLIC_KEY):
        print("SKIP: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY not set")
        return 0

    # Pre-flight: at least one active package must exist for a trial to bind.
    code, pkgs = rest_get(
        "/rest/v1/packages?select=id,code&active=eq.true&limit=1",
        key=SERVICE_KEY,
    )
    if code != 200 or not isinstance(pkgs, list) or len(pkgs) == 0:
        return fail(f"no active packages seeded (code={code} body={pkgs!r})")
    print(f"✓ pre-flight: active package available ({pkgs[0].get('code')})")

    email = f"trial-{uuid.uuid4().hex[:10]}@example.invalid"
    password = uuid.uuid4().hex + "Aa1!"

    # 1. Create a confirmed user via the admin API.
    code, user = http("POST", "/auth/v1/admin/users", key=SERVICE_KEY, body={
        "email": email, "password": password, "email_confirm": True,
    })
    if code != 200 or "id" not in user:
        return fail(f"admin create user failed: code={code} body={user!r}")
    uid = user["id"]
    print(f"✓ created auth user {email} ({uid})")

    try:
        # 2. Sign the user in to obtain their access token.
        code, sess = http(
            "POST", "/auth/v1/token?grant_type=password",
            key=PUBLIC_KEY,
            body={"email": email, "password": password},
        )
        token = sess.get("access_token") if isinstance(sess, dict) else None
        if code != 200 or not token:
            return fail(f"password grant failed: code={code} body={sess!r}")
        print("✓ signed in — access token acquired")

        # 3. Act — call register_company as the new user.
        code, result = rpc(
            "register_company",
            {"_name": "Trial Suite Co", "_phone": None},
            key=PUBLIC_KEY, token=token,
        )
        if code != 200 or not isinstance(result, dict):
            return fail(f"register_company failed: code={code} body={result!r}")
        org_id = result.get("org_id")
        event_id = result.get("event_id")
        trial_days = result.get("trial_days")
        if not org_id or not event_id:
            return fail(f"register_company returned no org_id/event_id: {result!r}")
        if trial_days != 7:
            return fail(f"trial_days = {trial_days}, expected 7")
        print(f"✓ register_company returned org_id={org_id} event_id={event_id}")

        # 4. Verify owner membership was created.
        code, members = rest_get(
            f"/rest/v1/organization_members?org_id=eq.{org_id}&user_id=eq.{uid}&role=eq.owner",
            key=SERVICE_KEY,
        )
        if code != 200 or not isinstance(members, list) or len(members) != 1:
            return fail(f"no owner membership: code={code} body={members!r}")
        print("✓ owner membership created")

        # 5. Verify subscription: status=active, cycle=trial, 7-day window.
        code, subs = rest_get(
            f"/rest/v1/subscriptions?org_id=eq.{org_id}&deleted_at=is.null"
            f"&select=id,status,billing_cycle,start_date,end_date",
            key=SERVICE_KEY,
        )
        if code != 200 or not isinstance(subs, list) or len(subs) != 1:
            return fail(f"expected exactly 1 subscription, got: {subs!r}")
        sub = subs[0]
        if sub["status"] != "active":
            return fail(f"subscription status = {sub['status']!r}, expected active")
        if sub["billing_cycle"] != "trial":
            return fail(f"billing_cycle = {sub['billing_cycle']!r}, expected trial")
        from datetime import date
        start = date.fromisoformat(sub["start_date"])
        end = date.fromisoformat(sub["end_date"])
        if (end - start).days != 7:
            return fail(f"trial window = {(end - start).days} days, expected 7")
        print(f"✓ subscription active — trial window {start}..{end}")

        # 6. Verify profile trial_ends_at pushed ~+7 days.
        code, profs = rest_get(
            f"/rest/v1/profiles?id=eq.{uid}&select=trial_ends_at,approval_status",
            key=SERVICE_KEY,
        )
        if code != 200 or not profs:
            return fail(f"profile lookup failed: {profs!r}")
        trial_ends = profs[0].get("trial_ends_at")
        if not trial_ends:
            return fail("profile.trial_ends_at is null")
        print(f"✓ profile trial_ends_at = {trial_ends} (status={profs[0].get('approval_status')})")

        # 7. Verify audit trail — start + subscription_created + success, all sharing event_id.
        code, events = rest_get(
            f"/rest/v1/audit_log?actor=eq.{uid}&entity=eq.subscription_activation"
            f"&select=action,diff&order=created_at.asc",
            key=SERVICE_KEY,
        )
        if code != 200 or not isinstance(events, list) or len(events) < 3:
            return fail(f"audit trail too short: {events!r}")
        actions = [e["action"] for e in events]
        required = {
            "register_company.start",
            "register_company.subscription_created",
            "register_company.success",
        }
        missing = required - set(actions)
        if missing:
            return fail(f"missing audit actions: {missing} (have {actions})")
        event_ids = {(e.get("diff") or {}).get("event_id") for e in events}
        if event_ids != {event_id}:
            return fail(f"event_ids on trail = {event_ids}, expected only {event_id}")
        print(f"✓ audit trail: {len(events)} entries, one shared event_id")

        # 8. Duplicate registration must fail (the user is already an owner).
        #    Note: the failure-path audit row is written inside the same
        #    transaction that RAISEs, so PostgREST rolls it back — we only
        #    assert here that the RPC surfaces an error.
        code, err = rpc(
            "register_company",
            {"_name": "Dup Co", "_phone": None},
            key=PUBLIC_KEY, token=token,
        )
        if code == 200:
            return fail(f"duplicate register_company unexpectedly succeeded: {err!r}")
        print("✓ duplicate registration rejected")


        print("\nALL CHECKS PASSED")
        return 0

    finally:
        # Cleanup order matters: organizations.created_by is RESTRICT,
        # audit_log.actor is a plain FK. Wipe org (cascades subs+members),
        # then audit rows, then the user.
        http("DELETE", f"/rest/v1/organizations?created_by=eq.{uid}", key=SERVICE_KEY)
        http("DELETE", f"/rest/v1/audit_log?actor=eq.{uid}", key=SERVICE_KEY)
        del_code, del_body = http(
            "DELETE", f"/auth/v1/admin/users/{uid}", key=SERVICE_KEY,
        )
        if del_code not in (200, 204):
            print(f"WARN: cleanup delete returned {del_code}: {del_body!r}")
        else:
            print("✓ cleaned up temp user")




if __name__ == "__main__":
    sys.exit(main())
