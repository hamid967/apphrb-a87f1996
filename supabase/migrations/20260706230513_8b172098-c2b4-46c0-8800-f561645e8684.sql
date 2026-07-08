
-- 1. Extend spending_policies with rule types
ALTER TABLE public.spending_policies
  ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'max_amount',
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS period_days integer,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'warn';

ALTER TABLE public.spending_policies
  DROP CONSTRAINT IF EXISTS spending_policies_rule_type_check;
ALTER TABLE public.spending_policies
  ADD CONSTRAINT spending_policies_rule_type_check
  CHECK (rule_type IN ('max_amount','requires_receipt','requires_description','forbidden_keywords','max_per_period'));

ALTER TABLE public.spending_policies
  DROP CONSTRAINT IF EXISTS spending_policies_severity_check;
ALTER TABLE public.spending_policies
  ADD CONSTRAINT spending_policies_severity_check
  CHECK (severity IN ('warn','block'));

-- Allow max_amount = 0 for rule types where it doesn't apply
ALTER TABLE public.spending_policies
  ALTER COLUMN max_amount DROP NOT NULL;

-- 2. policy_violations
CREATE TABLE IF NOT EXISTS public.policy_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.spending_policies(id) ON DELETE SET NULL,
  rule_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  category text,
  reason text NOT NULL,
  amount numeric(14,2),
  limit_amount numeric(14,2),
  currency text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_violations TO authenticated;
GRANT ALL ON public.policy_violations TO service_role;

ALTER TABLE public.policy_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read policy_violations" ON public.policy_violations;
CREATE POLICY "org members read policy_violations"
  ON public.policy_violations FOR SELECT
  TO authenticated
  USING (is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "admins manage policy_violations" ON public.policy_violations;
CREATE POLICY "admins manage policy_violations"
  ON public.policy_violations FOR ALL
  TO authenticated
  USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE INDEX IF NOT EXISTS idx_policy_violations_org_created
  ON public.policy_violations (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_violations_claim
  ON public.policy_violations (claim_id);

-- 3. Rules engine trigger function
CREATE OR REPLACE FUNCTION public.tg_check_spending_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Clear previous violations for this claim before re-evaluating
  DELETE FROM public.policy_violations WHERE claim_id = NEW.id;

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
         NEW.amount, p.max_amount, COALESCE(p.currency, NEW.currency));

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

-- Re-fire on relevant column updates too
DROP TRIGGER IF EXISTS trg_expense_claims_policy_check ON public.expense_claims;
CREATE TRIGGER trg_expense_claims_policy_check
AFTER INSERT OR UPDATE OF amount, category, description, receipt_url, status
ON public.expense_claims
FOR EACH ROW EXECUTE FUNCTION public.tg_check_spending_policy();
