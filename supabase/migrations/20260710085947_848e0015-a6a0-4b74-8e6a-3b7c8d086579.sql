
-- Remove duplicate trigger/function added in prior migration; the pre-existing
-- tg_check_spending_policy already covers INSERT + UPDATE with a superset of
-- rules (max_amount, requires_receipt, requires_description, forbidden_keywords,
-- max_per_period) plus audit_log entries.
DROP TRIGGER IF EXISTS trg_claim_policy_violations_ins ON public.expense_claims;
DROP TRIGGER IF EXISTS trg_claim_policy_violations_upd ON public.expense_claims;
DROP FUNCTION IF EXISTS public.recompute_claim_policy_violations();
