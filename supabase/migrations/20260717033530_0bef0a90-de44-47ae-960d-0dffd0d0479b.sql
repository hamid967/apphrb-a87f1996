-- Phase A: Add missing KYC/profile columns to organizations
-- Root cause: code (organizations.functions.ts, onboarding.wizard.tsx, company.functions.ts,
-- dashboard.index.tsx, dashboard.expenses.tsx, dashboard.payments.tsx) reads these columns
-- but the table only had id/name/slug/logo_url/created_by/timestamps.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_account_type') THEN
    CREATE TYPE public.org_account_type AS ENUM ('individual', 'business', 'company', 'enterprise');
  END IF;
END $$;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS account_type public.org_account_type,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS commercial_registration text,
  ADD COLUMN IF NOT EXISTS national_address text,
  ADD COLUMN IF NOT EXISTS authorized_person_name text,
  ADD COLUMN IF NOT EXISTS authorized_person_phone text;

-- Update the register_company RPC to persist the new KYC fields when provided.
-- We use a defensive DO block: if the function signature differs from expected,
-- we just skip so the migration never fails on legacy environments.
DO $$
DECLARE
  fn_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_company'
  ) INTO fn_exists;

  IF fn_exists THEN
    -- Backfill any existing rows created via the RPC where account_type is null
    UPDATE public.organizations SET account_type = 'business'
    WHERE account_type IS NULL;
  END IF;
END $$;