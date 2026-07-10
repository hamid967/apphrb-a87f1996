
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS zatca_rejection_reason text;
