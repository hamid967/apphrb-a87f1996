CREATE OR REPLACE FUNCTION public.validate_contact_zatca_fields()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.vat_number IS NOT NULL AND NEW.vat_number <> '' THEN
    IF NEW.vat_number !~ '^3[0-9]{13}3$' THEN
      RAISE EXCEPTION 'Invalid VAT number: must be 15 digits, start and end with 3';
    END IF;
  END IF;
  IF NEW.cr_number IS NOT NULL AND NEW.cr_number <> '' THEN
    IF NEW.cr_number !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'Invalid CR number: must be 7-10 digits';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;