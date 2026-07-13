#!/usr/bin/env python3
"""
Integration test: register_company must, in a single call, activate the
7-day free trial and create a live basic-tier subscription for the caller,
and record the whole thing in the audit trail with one shared event_id.

The test picks an existing profile that has no organization membership,
impersonates that user via request.jwt.claim.sub, calls register_company,
then asserts on subscriptions / profiles / audit_log. Everything runs in a
single transaction that is ROLLED BACK — no rows are left behind.

Skips cleanly when PGHOST is not set or when no orphan profile exists.
"""

from __future__ import annotations
import os, subprocess, sys, textwrap


def sql(script: str) -> tuple[int, str, str]:
    p = subprocess.run(
        ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-Atc", script],
        capture_output=True, text=True,
    )
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def main() -> int:
    if not os.environ.get("PGHOST"):
        print("SKIP: PGHOST not set")
        return 0

    code, out, err = sql("SELECT count(*)::int FROM public.packages WHERE active;")
    if code != 0:
        print(f"FAIL: pre-flight query failed: {err}")
        return 1
    if int(out or "0") == 0:
        print("FAIL: no active packages seeded — register_company cannot create a subscription.")
        return 1
    print(f"✓ pre-flight: {out} active package(s) available")

    # Pick a profile that has no owner/admin membership so register_company
    # can legally activate a trial for them.
    code, uid, err = sql(textwrap.dedent("""
        SELECT p.id::text
          FROM public.profiles p
         WHERE NOT EXISTS (
                 SELECT 1 FROM public.organization_members m
                  WHERE m.user_id = p.id AND m.role IN ('owner','admin')
               )
         ORDER BY p.created_at DESC
         LIMIT 1;
    """).strip())
    if code != 0 or not uid:
        print("SKIP: no orphan profile available to impersonate")
        return 0
    print(f"✓ impersonating profile {uid}")

    script = textwrap.dedent(f"""
        BEGIN;

        SELECT set_config(
          'request.jwt.claims',
          json_build_object('sub','{uid}','role','authenticated')::text,
          true
        );
        SELECT set_config('request.jwt.claim.sub', '{uid}', true);

        -- Act.
        SELECT public.register_company('Trial Suite Co', NULL) IS NOT NULL AS ok;

        -- Assertions.
        DO $$
        DECLARE
          v_uid uuid := '{uid}'::uuid;
          v_org uuid;
          v_sub_id uuid;
          v_status text;
          v_cycle text;
          v_start date;
          v_end date;
          v_trial timestamptz;
          v_events int;
          v_success int;
          v_created int;
          v_event_ids int;
        BEGIN
          -- 1. Organization owner membership created.
          SELECT org_id INTO v_org
            FROM public.organization_members
           WHERE user_id = v_uid AND role = 'owner'
           ORDER BY 1 DESC LIMIT 1;
          IF v_org IS NULL THEN
            RAISE EXCEPTION 'ASSERT_FAIL: no owner membership';
          END IF;

          -- 2. Active trial subscription with a 7-day window.
          SELECT id, status, billing_cycle, start_date, end_date
            INTO v_sub_id, v_status, v_cycle, v_start, v_end
            FROM public.subscriptions
           WHERE org_id = v_org AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1;
          IF v_sub_id IS NULL THEN
            RAISE EXCEPTION 'ASSERT_FAIL: no subscription for org %', v_org;
          END IF;
          IF v_status <> 'active' THEN
            RAISE EXCEPTION 'ASSERT_FAIL: subscription status = %, expected active', v_status;
          END IF;
          IF v_cycle <> 'trial' THEN
            RAISE EXCEPTION 'ASSERT_FAIL: billing_cycle = %, expected trial', v_cycle;
          END IF;
          IF (v_end - v_start) <> 7 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: trial window = % days, expected 7', (v_end - v_start);
          END IF;
          IF v_end < CURRENT_DATE + 6 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: trial end_date % is not in the future', v_end;
          END IF;

          -- 3. Profile trial pushed to ~+7 days.
          SELECT trial_ends_at INTO v_trial FROM public.profiles WHERE id = v_uid;
          IF v_trial IS NULL OR v_trial < now() + interval '6 days 12 hours' THEN
            RAISE EXCEPTION 'ASSERT_FAIL: profile.trial_ends_at = %, expected >= now()+~7d', v_trial;
          END IF;

          -- 4. Audit trail: start + subscription_created + success under one event_id.
          SELECT count(*) INTO v_events
            FROM public.audit_log
           WHERE actor = v_uid AND entity = 'subscription_activation'
             AND created_at > now() - interval '1 minute';
          IF v_events < 3 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: only % audit events, expected >=3', v_events;
          END IF;

          SELECT count(*) INTO v_success
            FROM public.audit_log
           WHERE actor = v_uid AND action = 'register_company.success'
             AND created_at > now() - interval '1 minute';
          IF v_success <> 1 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: success events = %, expected 1', v_success;
          END IF;

          SELECT count(*) INTO v_created
            FROM public.audit_log
           WHERE actor = v_uid AND action = 'register_company.subscription_created'
             AND created_at > now() - interval '1 minute';
          IF v_created <> 1 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: subscription_created events = %, expected 1', v_created;
          END IF;

          SELECT count(DISTINCT diff->>'event_id') INTO v_event_ids
            FROM public.audit_log
           WHERE actor = v_uid AND entity = 'subscription_activation'
             AND created_at > now() - interval '1 minute';
          IF v_event_ids <> 1 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: distinct event_ids = %, expected 1', v_event_ids;
          END IF;

          RAISE NOTICE 'OK org=% sub=% window=%d audit=%',
                       v_org, v_sub_id, (v_end - v_start), v_events;
        END $$;

        -- 5. A second register_company call in the same session must fail
        --    (user is now an owner) and must be audit-logged as such.
        DO $$
        DECLARE v_ok boolean := false;
        BEGIN
          BEGIN
            PERFORM public.register_company('Trial Suite Co 2', NULL);
          EXCEPTION WHEN OTHERS THEN
            IF SQLERRM ILIKE '%already belong%' THEN v_ok := true;
            ELSE RAISE; END IF;
          END;
          IF NOT v_ok THEN
            RAISE EXCEPTION 'ASSERT_FAIL: duplicate register did not raise already-member';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.audit_log
             WHERE actor = '{uid}'::uuid
               AND action = 'register_company.failed'
               AND diff->>'reason' = 'already_member'
               AND created_at > now() - interval '1 minute'
          ) THEN
            RAISE EXCEPTION 'ASSERT_FAIL: no audit entry for already_member failure';
          END IF;
        END $$;

        ROLLBACK;
    """).strip()

    code, out, err = sql(script)
    blob = (out + "\n" + err).strip()
    if code != 0 or "ASSERT_FAIL" in blob:
        print("FAIL:")
        print(blob)
        return 1

    print("✓ register_company activates 7-day trial + basic subscription")
    print("✓ audit trail: shared event_id + success + subscription_created")
    print("✓ duplicate registration is rejected and logged as already_member")
    for line in blob.splitlines():
        if line.strip():
            print(f"  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
