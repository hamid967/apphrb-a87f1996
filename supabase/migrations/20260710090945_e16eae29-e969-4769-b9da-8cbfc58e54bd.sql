
-- Preserve admin overrides across trigger re-evaluations.
-- 1) Add unique key so recompute can skip duplicates.
-- 2) Keep overridden rows when clearing prior violations.
-- 3) Insert with ON CONFLICT DO NOTHING to avoid clobbering overrides.

CREATE UNIQUE INDEX IF NOT EXISTS policy_violations_claim_policy_rule_uq
  ON public.policy_violations (claim_id, COALESCE(policy_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_type);

CREATE OR REPLACE FUNCTION public.tg_check_spending_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cat text;
  v_desc text;
  v_receipt text;
  p record;
  v_reason text;
  v_period_total numeric;
  v_kw text;
  v_matched boolean;
BEGIN
  v_cat := COALESCE(NEW.category, 'general');
  v_desc := COALESCE(NEW.description, '');
  v_receipt := COALESCE(NEW.receipt_url, '');

  -- Clear only non-overridden violations for this claim before re-evaluating.
  DELETE FROM public.policy_violations
   WHERE claim_id = NEW.id AND overridden_by IS NULL;

  FOR p IN
    SELECT * FROM public.spending_policies
     WHERE org_id = NEW.org_id AND active
       AND (category = v_cat OR category = 'general' OR category = '*')
  LOOP
    v_reason := NULL;

    IF p.rule_type = 'max_amount' AND p.max_amount IS NOT NULL AND NEW.amount > p.max_amount THEN
      v_reason := format('Amount %s exceeds cap %s for %s', NEW.amount, p.max_amount, v_cat);

    ELSIF p.rule_type = 'requires_receipt' AND (v_receipt = '' OR v_receipt IS NULL) THEN
      v_reason := format('A receipt is required for %s claims', v_cat);

    ELSIF p.rule_type = 'requires_description' AND length(trim(v_desc)) < 4 THEN
      v_reason := format('A description is required for %s claims', v_cat);

    ELSIF p.rule_type = 'forbidden_keywords' AND array_length(p.keywords, 1) > 0 THEN
      v_matched := false;
      FOREACH v_kw IN ARRAY p.keywords LOOP
        IF v_kw <> '' AND (
             position(lower(v_kw) in lower(v_desc)) > 0
          OR position(lower(v_kw) in lower(COALESCE(NEW.title,''))) > 0
        ) THEN
          v_matched := true;
          v_reason := format('Contains forbidden keyword "%s"', v_kw);
          EXIT;
        END IF;
      END LOOP;

    ELSIF p.rule_type = 'max_per_period' AND p.max_amount IS NOT NULL AND COALESCE(p.period_days, 30) > 0 THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_period_total
        FROM public.expense_claims
       WHERE org_id = NEW.org_id
         AND submitted_by = NEW.submitted_by
         AND COALESCE(category,'general') = v_cat
         AND deleted_at IS NULL
         AND status <> 'rejected'
         AND created_at >= now() - make_interval(days => p.period_days);
      IF v_period_total > p.max_amount THEN
        v_reason := format('Rolling %s-day total %s exceeds cap %s for %s',
          p.period_days, v_period_total, p.max_amount, v_cat);
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      INSERT INTO public.policy_violations
        (org_id, claim_id, policy_id, rule_type, severity, category, reason, amount, limit_amount, currency)
      VALUES
        (NEW.org_id, NEW.id, p.id, p.rule_type, p.severity, v_cat, v_reason,
         NEW.amount, p.max_amount, COALESCE(p.currency, NEW.currency))
      ON CONFLICT (claim_id, COALESCE(policy_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_type) DO NOTHING;

      INSERT INTO audit_log(entity, entity_id, actor, action, diff)
      VALUES ('expense_claims', NEW.id, auth.uid(), 'POLICY_VIOLATION',
        jsonb_build_object(
          'org_id', NEW.org_id,
          'category', v_cat,
          'rule_type', p.rule_type,
          'severity', p.severity,
          'reason', v_reason,
          'amount', NEW.amount,
          'limit', p.max_amount,
          'claim_number', NEW.claim_number
        ));
    END IF;
  END LOOP;

  RETURN NEW;
END $function$;
