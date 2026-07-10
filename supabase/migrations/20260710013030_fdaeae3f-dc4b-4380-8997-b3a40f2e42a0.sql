ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS cr_number text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_building_number text,
  ADD COLUMN IF NOT EXISTS address_additional_number text,
  ADD COLUMN IF NOT EXISTS address_district text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_country_code text NOT NULL DEFAULT 'SA';

-- ZATCA requires 15-digit VAT starting with 3 and ending with 3 (Saudi format).
CREATE OR REPLACE FUNCTION public.validate_contact_zatca_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS trg_contacts_zatca_validate ON public.contacts;
CREATE TRIGGER trg_contacts_zatca_validate
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.validate_contact_zatca_fields();

CREATE INDEX IF NOT EXISTS idx_contacts_vat_number ON public.contacts (org_id, vat_number) WHERE vat_number IS NOT NULL;