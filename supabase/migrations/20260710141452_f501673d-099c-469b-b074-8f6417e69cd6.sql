
-- 1) Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own push subs select" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own push subs insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own push subs update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own push subs delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

CREATE OR REPLACE FUNCTION public.tg_push_subs_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_push_subs_touch ON public.push_subscriptions;
CREATE TRIGGER trg_push_subs_touch BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_push_subs_touch();

-- 2) Extend policy violation notifier to also enqueue push rows
CREATE OR REPLACE FUNCTION public.notify_policy_violation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_link TEXT;
  v_vars JSONB;
  v_approver RECORD;
  v_policy_key TEXT;
  v_key_base TEXT;
BEGIN
  SELECT id, org_id, claim_number, submitted_by, title, amount, currency
    INTO v_claim
    FROM public.expense_claims
   WHERE id = NEW.claim_id;

  IF v_claim.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_link := '/dashboard/expenses/review?claim=' || v_claim.id::text || '#violation-' || NEW.id::text;

  v_vars := jsonb_build_object(
    'claim_id', v_claim.id,
    'claim_number', v_claim.claim_number,
    'claim_title', v_claim.title,
    'violation_id', NEW.id,
    'rule_type', NEW.rule_type,
    'severity', NEW.severity,
    'reason', NEW.reason,
    'amount', NEW.amount,
    'limit_amount', NEW.limit_amount,
    'currency', NEW.currency,
    'link', v_link
  );

  v_policy_key := COALESCE(NEW.policy_id::text, 'nil');
  v_key_base := 'pv:' || v_claim.id::text || ':' || v_policy_key || ':' || NEW.rule_type;

  -- Submitter (in_app + push)
  IF v_claim.submitted_by IS NOT NULL THEN
    INSERT INTO public.notification_queue (
      org_id, channel, recipient, template, variables, status, attempts,
      recipient_user_id, idempotency_key
    ) VALUES (
      NEW.org_id, 'in_app', v_claim.submitted_by::text,
      'policy_violation_submitter', v_vars, 'pending', 0,
      v_claim.submitted_by,
      v_key_base || ':sub:' || v_claim.submitted_by::text
    )
    ON CONFLICT (org_id, idempotency_key) DO NOTHING;

    INSERT INTO public.notification_queue (
      org_id, channel, recipient, template, variables, status, attempts,
      recipient_user_id, idempotency_key
    ) VALUES (
      NEW.org_id, 'push', v_claim.submitted_by::text,
      'policy_violation_submitter', v_vars, 'pending', 0,
      v_claim.submitted_by,
      v_key_base || ':sub:push:' || v_claim.submitted_by::text
    )
    ON CONFLICT (org_id, idempotency_key) DO NOTHING;
  END IF;

  -- Pending approvers (in_app + push)
  FOR v_approver IN
    SELECT DISTINCT ur.user_id
      FROM public.expense_claim_approvals eca
      JOIN public.user_roles ur ON ur.role::text = eca.required_role
     WHERE eca.claim_id = v_claim.id
       AND eca.decision IS NULL
  LOOP
    INSERT INTO public.notification_queue (
      org_id, channel, recipient, template, variables, status, attempts,
      recipient_user_id, idempotency_key
    ) VALUES (
      NEW.org_id, 'in_app', v_approver.user_id::text,
      'policy_violation_approver', v_vars, 'pending', 0,
      v_approver.user_id,
      v_key_base || ':apr:' || v_approver.user_id::text
    )
    ON CONFLICT (org_id, idempotency_key) DO NOTHING;

    INSERT INTO public.notification_queue (
      org_id, channel, recipient, template, variables, status, attempts,
      recipient_user_id, idempotency_key
    ) VALUES (
      NEW.org_id, 'push', v_approver.user_id::text,
      'policy_violation_approver', v_vars, 'pending', 0,
      v_approver.user_id,
      v_key_base || ':apr:push:' || v_approver.user_id::text
    )
    ON CONFLICT (org_id, idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_policy_violation() FROM PUBLIC, anon, authenticated;
