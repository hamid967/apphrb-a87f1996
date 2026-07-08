ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS ejar_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ejar_reference TEXT;

COMMENT ON COLUMN public.contracts.ejar_sent_at IS 'Timestamp when the contract was marked as sent to Ejar portal';
COMMENT ON COLUMN public.contracts.ejar_reference IS 'Optional Ejar portal reference number entered by the user';