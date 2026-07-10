-- Stable, deduplicating notifications for policy violations.
-- Key = pv:<claim>:<policy-or-nil>:<rule>:<kind>:<uid>
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

  -- Submitter
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
  END IF;

  -- Pending approvers
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
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_policy_violation() FROM PUBLIC, anon, authenticated;

-- Trigger stays AFTER INSERT only: UPDATEs (override / clear) never enqueue a new notification.
DROP TRIGGER IF EXISTS trg_notify_policy_violation ON public.policy_violations;
CREATE TRIGGER trg_notify_policy_violation
AFTER INSERT ON public.policy_violations
FOR EACH ROW
EXECUTE FUNCTION public.notify_policy_violation();