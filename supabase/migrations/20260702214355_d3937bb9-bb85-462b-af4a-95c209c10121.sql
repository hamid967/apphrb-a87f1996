
CREATE TABLE IF NOT EXISTS public.spending_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  max_amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spending_policies_org_cat ON public.spending_policies(org_id, category) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spending_policies TO authenticated;
GRANT ALL ON public.spending_policies TO service_role;

ALTER TABLE public.spending_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read spending_policies" ON public.spending_policies
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "admins manage spending_policies" ON public.spending_policies
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER trg_spending_policies_updated_at
  BEFORE UPDATE ON public.spending_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policy-check trigger on expense_claims -> audit_log
CREATE OR REPLACE FUNCTION public.tg_check_spending_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cat text;
  v_limit numeric;
BEGIN
  SELECT COALESCE(e.category::text, 'general') INTO v_cat
    FROM expenses e WHERE e.id = NEW.expense_id;
  IF v_cat IS NULL THEN v_cat := 'general'; END IF;

  SELECT max_amount INTO v_limit
    FROM spending_policies
   WHERE org_id = NEW.org_id AND active AND category = v_cat
   ORDER BY created_at DESC LIMIT 1;

  IF v_limit IS NOT NULL AND NEW.amount > v_limit THEN
    INSERT INTO audit_log(entity, entity_id, actor, action, diff)
    VALUES (
      'expense_claims', NEW.id, auth.uid(), 'POLICY_VIOLATION',
      jsonb_build_object(
        'org_id', NEW.org_id,
        'category', v_cat,
        'limit', v_limit,
        'amount', NEW.amount,
        'claim_number', NEW.claim_number
      )
    );
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_expense_claims_policy_check ON public.expense_claims;
CREATE TRIGGER trg_expense_claims_policy_check
  AFTER INSERT OR UPDATE OF amount, expense_id ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_check_spending_policy();

-- Seed function
CREATE OR REPLACE FUNCTION public.seed_spending_policies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  uid uuid := auth.uid();
  org uuid;
  exp record;
  i int := 0;
  violations int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT id INTO org FROM organizations
   WHERE created_by = uid AND name = 'AQARY Demo'
   ORDER BY created_at DESC LIMIT 1;
  IF org IS NULL THEN RAISE EXCEPTION 'Run seed_demo_data first'; END IF;

  INSERT INTO spending_policies(org_id, category, max_amount, currency, note) VALUES
    (org, 'maintenance', 1500, 'SAR', 'Per-claim maintenance cap'),
    (org, 'utilities',    800, 'SAR', 'Utilities reimbursements cap'),
    (org, 'marketing',   2000, 'SAR', 'Marketing spend cap'),
    (org, 'salaries',    5000, 'SAR', 'Salary advance cap'),
    (org, 'supplies',     500, 'SAR', 'Office supplies cap')
  ON CONFLICT DO NOTHING;

  -- Generate 6 claims: 3 compliant (below cap), 3 violating (above cap)
  FOR exp IN
    SELECT id, category::text AS cat FROM expenses
     WHERE org_id = org ORDER BY spent_at DESC LIMIT 6
  LOOP
    i := i + 1;
    INSERT INTO expense_claims(
      org_id, claim_number, status, expense_id,
      title, description, amount, currency, submitted_by, submitted_at
    ) VALUES (
      org,
      'CLM-POL-'||to_char(now(),'YYYY')||'-'||lpad(i::text,4,'0'),
      CASE WHEN i%2=0 THEN 'submitted'::expense_claim_status ELSE 'draft'::expense_claim_status END,
      exp.id,
      CASE WHEN i<=3 THEN 'Compliant claim #'||i ELSE 'Over-limit claim #'||i END,
      'Policy test — '||exp.cat,
      CASE
        WHEN i<=3 THEN
          COALESCE((SELECT max_amount FROM spending_policies WHERE org_id=org AND category=exp.cat AND active LIMIT 1), 400) * 0.5
        ELSE
          COALESCE((SELECT max_amount FROM spending_policies WHERE org_id=org AND category=exp.cat AND active LIMIT 1), 400) * 2.5
      END,
      'SAR', uid, now()
    );
  END LOOP;

  SELECT count(*) INTO violations
    FROM audit_log
   WHERE action='POLICY_VIOLATION' AND (diff->>'org_id')::uuid = org;

  RETURN jsonb_build_object(
    'org_id', org,
    'policies', 5,
    'claims_created', i,
    'total_violations_logged', violations
  );
END $fn$;

GRANT EXECUTE ON FUNCTION public.seed_spending_policies() TO authenticated;
