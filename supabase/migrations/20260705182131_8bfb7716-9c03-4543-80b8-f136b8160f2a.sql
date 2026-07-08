
-- Add 'corrected' status and correction linkage for expense_claims
ALTER TYPE public.expense_claim_status ADD VALUE IF NOT EXISTS 'corrected';

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS original_claim_id uuid REFERENCES public.expense_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_reason text;

CREATE INDEX IF NOT EXISTS idx_expense_claims_original_claim_id
  ON public.expense_claims(original_claim_id);
