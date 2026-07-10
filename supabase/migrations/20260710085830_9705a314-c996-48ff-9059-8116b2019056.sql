
-- Auto-log policy violations for expense claims on insert/update.
-- Rules evaluated from public.spending_policies (active only, matching org):
--   rule_type='max_amount': violation when claim.amount > max_amount for same category+currency
--   rule_type='keywords'  : violation when title/description ILIKE any keyword

CREATE OR REPLACE FUNCTION public.recompute_claim_policy_violations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear previous auto-logged violations for this claim
  DELETE FROM public.policy_violations WHERE claim_id = NEW.id;

  -- Amount-limit violations
  INSERT INTO public.policy_violations
    (org_id, claim_id, policy_id, rule_type, severity, category, reason, amount, limit_amount, currency)
  SELECT
    NEW.org_id,
    NEW.id,
    sp.id,
    'max_amount',
    COALESCE(sp.severity, 'warning'),
    sp.category,
    format('Amount %s %s exceeds limit %s %s for category "%s"',
           NEW.amount, NEW.currency, sp.max_amount, sp.currency, sp.category),
    NEW.amount,
    sp.max_amount,
    sp.currency
  FROM public.spending_policies sp
  WHERE sp.org_id = NEW.org_id
    AND sp.active = TRUE
    AND sp.rule_type = 'max_amount'
    AND sp.max_amount IS NOT NULL
    AND sp.category = NEW.category
    AND sp.currency = NEW.currency
    AND NEW.amount > sp.max_amount;

  -- Keyword violations
  INSERT INTO public.policy_violations
    (org_id, claim_id, policy_id, rule_type, severity, category, reason, amount, currency)
  SELECT
    NEW.org_id,
    NEW.id,
    sp.id,
    'keywords',
    COALESCE(sp.severity, 'warning'),
    sp.category,
    format('Claim text matches restricted keyword(s): %s',
           array_to_string(
             ARRAY(
               SELECT k FROM unnest(sp.keywords) k
               WHERE COALESCE(NEW.title,'') ILIKE '%'||k||'%'
                  OR COALESCE(NEW.description,'') ILIKE '%'||k||'%'
             ), ', ')),
    NEW.amount,
    NEW.currency
  FROM public.spending_policies sp
  WHERE sp.org_id = NEW.org_id
    AND sp.active = TRUE
    AND sp.rule_type = 'keywords'
    AND sp.keywords IS NOT NULL
    AND array_length(sp.keywords, 1) > 0
    AND EXISTS (
      SELECT 1 FROM unnest(sp.keywords) k
      WHERE COALESCE(NEW.title,'') ILIKE '%'||k||'%'
         OR COALESCE(NEW.description,'') ILIKE '%'||k||'%'
    );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_claim_policy_violations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_claim_policy_violations_ins ON public.expense_claims;
DROP TRIGGER IF EXISTS trg_claim_policy_violations_upd ON public.expense_claims;

CREATE TRIGGER trg_claim_policy_violations_ins
AFTER INSERT ON public.expense_claims
FOR EACH ROW
EXECUTE FUNCTION public.recompute_claim_policy_violations();

CREATE TRIGGER trg_claim_policy_violations_upd
AFTER UPDATE OF amount, currency, category, title, description, status ON public.expense_claims
FOR EACH ROW
WHEN (
  OLD.amount IS DISTINCT FROM NEW.amount
  OR OLD.currency IS DISTINCT FROM NEW.currency
  OR OLD.category IS DISTINCT FROM NEW.category
  OR OLD.title IS DISTINCT FROM NEW.title
  OR OLD.description IS DISTINCT FROM NEW.description
)
EXECUTE FUNCTION public.recompute_claim_policy_violations();

-- Backfill: recompute violations for all existing non-deleted claims
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.expense_claims WHERE deleted_at IS NULL LOOP
    UPDATE public.expense_claims SET updated_at = updated_at WHERE id = r.id;
  END LOOP;
END $$;
