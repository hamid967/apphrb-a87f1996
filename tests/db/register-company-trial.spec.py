#!/usr/bin/env python3
"""
Integration test: registering a new company must, in a single call,
- create the organization + owner membership,
- start the 7-day free trial on the profile (trial_ends_at),
- create an ACTIVE subscription row (billing_cycle=trial, 7-day window)
  bound to a real package, and
- write a matching audit trail with one stable event_id
  (start → subscription_created → success).

Runs against the sandbox Postgres via PGHOST. Everything happens in a
single transaction that is ROLLED BACK, so no state leaks.
"""

from __future__ import annotations
import os, subprocess, sys, textwrap, uuid


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

    # Pre-flight: there must be at least one active package.
    code, out, err = sql("SELECT count(*)::int FROM public.packages WHERE active;")
    if code != 0:
        print(f"FAIL: pre-flight query failed: {err}")
        return 1
    if int(out or "0") == 0:
        print("FAIL: no active packages seeded — register_company cannot create a subscription.")
        return 1
    print(f"✓ pre-flight: {out} active package(s) available")

    uid = str(uuid.uuid4())
    name = f"Test Co {uid[:8]}"

    script = textwrap.dedent(f"""
        BEGIN;

        -- Fabricate a minimal auth.users row so FKs and auth.uid() line up.
        INSERT INTO auth.users(
          instance_id, id, aud, role, email,
          encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, is_anonymous
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          '{uid}'::uuid, 'authenticated', 'authenticated',
          'trial-test-{uid[:8]}@example.invalid',
          '', now(), '{{}}'::jsonb, '{{}}'::jsonb, now(), now(), false
        );

        -- Ensure a profile row exists (handle_new_user trigger normally does this,
        -- but we insert defensively so the UPDATE inside register_company hits).
        INSERT INTO public.profiles(id) VALUES ('{uid}'::uuid)
        ON CONFLICT (id) DO NOTHING;

        -- Act as the new user.
        SELECT set_config('request.jwt.claim.sub', '{uid}', true);
        SELECT set_config('role', 'authenticated', true);

        -- Call the function under test (discard the jsonb result).
        SELECT public.register_company('{name}', NULL) IS NOT NULL AS ok;



        -- === Assertions ===
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
          v_success_events int;
          v_created_events int;
          v_event_ids int;
        BEGIN
          -- Organization owner membership
          SELECT org_id INTO v_org
            FROM public.organization_members
           WHERE user_id = v_uid AND role = 'owner'
           LIMIT 1;
          IF v_org IS NULL THEN
            RAISE EXCEPTION 'ASSERT_FAIL: no owner membership for new user';
          END IF;

          -- Subscription: active, trial, 7-day window
          SELECT id, status, billing_cycle, start_date, end_date
            INTO v_sub_id, v_status, v_cycle, v_start, v_end
            FROM public.subscriptions
           WHERE org_id = v_org AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1;
          IF v_sub_id IS NULL THEN
            RAISE EXCEPTION 'ASSERT_FAIL: no subscription created for org %', v_org;
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

          -- Profile trial window pushed to +7 days
          SELECT trial_ends_at INTO v_trial FROM public.profiles WHERE id = v_uid;
          IF v_trial IS NULL OR v_trial < now() + interval '6 days 12 hours' THEN
            RAISE EXCEPTION 'ASSERT_FAIL: profile.trial_ends_at = %, expected >= now()+~7d', v_trial;
          END IF;

          -- Audit trail: success + subscription_created + shared event_id
          SELECT count(*) INTO v_events
            FROM public.audit_log
           WHERE actor = v_uid AND entity = 'subscription_activation';
          IF v_events < 3 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: only % audit events, expected >=3', v_events;
          END IF;

          SELECT count(*) INTO v_success_events
            FROM public.audit_log
           WHERE actor = v_uid AND action = 'register_company.success';
          IF v_success_events <> 1 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: success events = %, expected 1', v_success_events;
          END IF;

          SELECT count(*) INTO v_created_events
            FROM public.audit_log
           WHERE actor = v_uid AND action = 'register_company.subscription_created';
          IF v_created_events <> 1 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: subscription_created events = %, expected 1', v_created_events;
          END IF;

          SELECT count(DISTINCT diff->>'event_id') INTO v_event_ids
            FROM public.audit_log
           WHERE actor = v_uid AND entity = 'subscription_activation';
          IF v_event_ids <> 1 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: distinct event_ids = %, expected 1 shared id', v_event_ids;
          END IF;

          RAISE NOTICE 'OK org=% sub=% trial_days=% audit_events=%',
                       v_org, v_sub_id, (v_end - v_start), v_events;
        END $$;

        -- Duplicate registration must fail (already an owner)
        DO $$
        DECLARE v_ok boolean := false;
        BEGIN
          BEGIN
            PERFORM public.register_company('Another Co {uid[:6]}', NULL);
          EXCEPTION WHEN OTHERS THEN
            IF SQLERRM ILIKE '%already belong%' THEN
              v_ok := true;
            ELSE
              RAISE;
            END IF;
          END;
          IF NOT v_ok THEN
            RAISE EXCEPTION 'ASSERT_FAIL: duplicate register_company did not raise already-member';
          END IF;

          -- Duplicate attempt must be logged as failed with the already_member reason
          IF NOT EXISTS (
            SELECT 1 FROM public.audit_log
             WHERE actor = '{uid}'::uuid
               AND action = 'register_company.failed'
               AND diff->>'reason' = 'already_member'
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
    print("✓ duplicate registration is rejected and logged")
    for line in blob.splitlines():
        if line.strip():
            print(f"  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
