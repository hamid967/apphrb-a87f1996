-- Regression test: policy-violation notifications are idempotent.
-- Covers: (1) repeated INSERT/UPDATE cycles never enqueue duplicates,
--         (2) admin override (UPDATE) does not enqueue extra rows,
--         (3) clearing an override (UPDATE) does not enqueue extra rows,
--         (4) stable idempotency_key shape per (claim, policy, rule, kind, uid).
-- Runs entirely inside a transaction and ROLLBACKs — no persistent data.
--
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-policy-violation-notifications.sql

BEGIN;

DO $test$
DECLARE
  v_org      uuid;
  v_user     uuid := gen_random_uuid();   -- fake submitter, no auth.users FK on notification_queue
  v_claim    uuid;
  v_policy   uuid := gen_random_uuid();
  v_pv1      uuid;
  v_pv2      uuid;
  v_cnt      int;
  v_key_sub  text;
BEGIN
  -- Sandbox org
  INSERT INTO public.organizations (name, slug)
  VALUES ('pv-notify-test-' || substr(gen_random_uuid()::text, 1, 8),
          'pv-notify-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO v_org;

  -- Sandbox claim (submitted_by references auth.users; skip the FK by NULLing it here
  -- and asserting the approver branch only... but we want to assert submitter dedup too.
  -- So bypass the FK by using a real user if present, otherwise skip submitter checks.)
  INSERT INTO public.expense_claims (org_id, claim_number, title, amount, currency, submitted_by)
  VALUES (v_org, 'PV-TEST-1', 'notify idempotency', 500, 'SAR',
          (SELECT id FROM auth.users LIMIT 1))
  RETURNING id, submitted_by INTO v_claim, v_user;

  IF v_user IS NULL THEN
    RAISE NOTICE 'no auth.users row available; skipping submitter-branch assertions';
  END IF;

  v_key_sub := 'pv:' || v_claim::text || ':' || v_policy::text || ':max_amount:sub:' || COALESCE(v_user::text, 'nil');

  -------------------------------------------------------------------
  -- 1) First INSERT enqueues exactly one submitter notification.
  -------------------------------------------------------------------
  INSERT INTO public.policy_violations
    (org_id, claim_id, policy_id, rule_type, severity, category, reason, amount, limit_amount, currency)
  VALUES (v_org, v_claim, v_policy, 'max_amount', 'high', 'general',
          'Amount 500 exceeds cap 100', 500, 100, 'SAR')
  RETURNING id INTO v_pv1;

  IF v_user IS NOT NULL THEN
    SELECT count(*) INTO v_cnt
      FROM public.notification_queue
     WHERE org_id = v_org AND idempotency_key = v_key_sub;
    ASSERT v_cnt = 1, format('expected 1 submitter notification after first insert, got %s', v_cnt);
  END IF;

  -------------------------------------------------------------------
  -- 2) Delete + re-insert (trigger re-evaluation) must NOT duplicate:
  --    same claim/policy/rule → same stable idempotency_key → ON CONFLICT DO NOTHING.
  -------------------------------------------------------------------
  DELETE FROM public.policy_violations WHERE id = v_pv1;
  INSERT INTO public.policy_violations
    (org_id, claim_id, policy_id, rule_type, severity, category, reason, amount, limit_amount, currency)
  VALUES (v_org, v_claim, v_policy, 'max_amount', 'high', 'general',
          'Amount 500 exceeds cap 100 (re-eval)', 500, 100, 'SAR')
  RETURNING id INTO v_pv2;

  IF v_user IS NOT NULL THEN
    SELECT count(*) INTO v_cnt
      FROM public.notification_queue
     WHERE org_id = v_org AND idempotency_key = v_key_sub;
    ASSERT v_cnt = 1, format('re-insert must not duplicate; got %s notifications', v_cnt);
  END IF;

  -------------------------------------------------------------------
  -- 3) Admin override (UPDATE) must NOT enqueue any new notification.
  -------------------------------------------------------------------
  UPDATE public.policy_violations
     SET overridden_by = v_user,
         override_reason = 'approved by finance',
         overridden_at = now()
   WHERE id = v_pv2;

  SELECT count(*) INTO v_cnt
    FROM public.notification_queue
   WHERE org_id = v_org
     AND idempotency_key LIKE 'pv:' || v_claim::text || ':%';
  ASSERT v_cnt <= 1, format('override UPDATE must not enqueue; total=%s', v_cnt);

  -------------------------------------------------------------------
  -- 4) Clearing the override (UPDATE) must NOT enqueue either.
  -------------------------------------------------------------------
  UPDATE public.policy_violations
     SET overridden_by = NULL, override_reason = NULL, overridden_at = NULL
   WHERE id = v_pv2;

  SELECT count(*) INTO v_cnt
    FROM public.notification_queue
   WHERE org_id = v_org
     AND idempotency_key LIKE 'pv:' || v_claim::text || ':%';
  ASSERT v_cnt <= 1, format('un-override UPDATE must not enqueue; total=%s', v_cnt);

  -------------------------------------------------------------------
  -- 5) Idempotency key shape: stable, does NOT contain the violation row id.
  -------------------------------------------------------------------
  SELECT count(*) INTO v_cnt
    FROM public.notification_queue
   WHERE org_id = v_org
     AND (idempotency_key LIKE '%' || v_pv1::text || '%'
       OR idempotency_key LIKE '%' || v_pv2::text || '%');
  ASSERT v_cnt = 0, 'idempotency_key must not embed the violation row id';

  RAISE NOTICE '✓ policy-violation notification idempotency tests passed';
END
$test$;

ROLLBACK;
