ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS receipt_url text;

-- Auto-generate claim_number when caller doesn't supply one.
CREATE OR REPLACE FUNCTION public.expense_claims_autonumber()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.claim_number IS NULL OR btrim(NEW.claim_number) = '' THEN
    NEW.claim_number := 'EC-' || to_char(now(), 'YYYYMMDD') || '-' ||
                        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_claims_autonumber_tg ON public.expense_claims;
CREATE TRIGGER expense_claims_autonumber_tg
  BEFORE INSERT ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.expense_claims_autonumber();