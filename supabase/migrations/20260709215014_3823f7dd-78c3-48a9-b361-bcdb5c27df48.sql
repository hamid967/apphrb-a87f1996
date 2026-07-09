-- =========================================================
-- Wave 2 Batch A: ZATCA columns on invoices + payment_schedules
-- =========================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.zatca_status AS ENUM ('draft','reported','cleared','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.zatca_invoice_type AS ENUM ('standard','simplified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_schedule_status AS ENUM ('pending','invoiced','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_schedule_source AS ENUM ('contract','deal','commission');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend invoices with ZATCA columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS zatca_uuid uuid,
  ADD COLUMN IF NOT EXISTS zatca_hash text,
  ADD COLUMN IF NOT EXISTS previous_hash text,
  ADD COLUMN IF NOT EXISTS qr_tlv text,
  ADD COLUMN IF NOT EXISTS xml_ubl text,
  ADD COLUMN IF NOT EXISTS zatca_status public.zatca_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS zatca_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_type public.zatca_invoice_type NOT NULL DEFAULT 'simplified';

CREATE INDEX IF NOT EXISTS idx_invoices_zatca_chain
  ON public.invoices (org_id, zatca_reported_at DESC NULLS LAST)
  WHERE zatca_status = 'reported';

-- 3) payment_schedules table
CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  source_type public.payment_schedule_source NOT NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  commission_id uuid REFERENCES public.commissions(id) ON DELETE CASCADE,
  installment_no int NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 15.00,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL,
  status public.payment_schedule_status NOT NULL DEFAULT 'pending',
  voucher_id uuid,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_schedules_one_source CHECK (
    (source_type = 'contract'   AND contract_id   IS NOT NULL AND deal_id IS NULL AND commission_id IS NULL) OR
    (source_type = 'deal'       AND deal_id       IS NOT NULL AND contract_id IS NULL AND commission_id IS NULL) OR
    (source_type = 'commission' AND commission_id IS NOT NULL AND contract_id IS NULL AND deal_id IS NULL)
  )
);

-- 4) GRANTs (public schema requires explicit grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedules TO authenticated;
GRANT ALL ON public.payment_schedules TO service_role;

-- 5) RLS
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read payment_schedules"
  ON public.payment_schedules FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org members insert payment_schedules"
  ON public.payment_schedules FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org members update payment_schedules"
  ON public.payment_schedules FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org admins delete payment_schedules"
  ON public.payment_schedules FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

-- 6) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_schedules_org_due
  ON public.payment_schedules (org_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_org_status
  ON public.payment_schedules (org_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract
  ON public.payment_schedules (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_commission
  ON public.payment_schedules (commission_id) WHERE commission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_voucher
  ON public.payment_schedules (voucher_id) WHERE voucher_id IS NOT NULL;

-- 7) updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_payment_schedules_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  -- auto overdue when past due & unpaid
  IF NEW.status = 'pending' AND NEW.due_date < current_date THEN
    NEW.status := 'overdue';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_schedules_touch ON public.payment_schedules;
CREATE TRIGGER trg_payment_schedules_touch
  BEFORE UPDATE ON public.payment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_schedules_touch();

-- Trigger fn is invoked directly by Postgres; do NOT grant EXECUTE to any role.
REVOKE EXECUTE ON FUNCTION public.tg_payment_schedules_touch() FROM PUBLIC, anon, authenticated;
