
ALTER TABLE public.zatca_csid
  ADD COLUMN IF NOT EXISTS private_key_encrypted text,
  ADD COLUMN IF NOT EXISTS public_key text,
  ADD COLUMN IF NOT EXISTS csr text,
  ADD COLUMN IF NOT EXISTS otp_used text,
  ADD COLUMN IF NOT EXISTS compliance_status text,
  ADD COLUMN IF NOT EXISTS compliance_request_id text;

DO $$ BEGIN
  CREATE TYPE public.zatca_submission_status AS ENUM ('pending','cleared','reported','warnings','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.zatca_invoice_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  environment text NOT NULL,
  signed_xml text,
  invoice_hash text,
  qr_code text,
  zatca_uuid text,
  previous_invoice_hash text,
  invoice_counter bigint,
  submission_status public.zatca_submission_status NOT NULL DEFAULT 'pending',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  cleared_xml text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, environment)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zatca_invoice_signatures TO authenticated;
GRANT ALL ON public.zatca_invoice_signatures TO service_role;

ALTER TABLE public.zatca_invoice_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zatca_sig: org members read"
  ON public.zatca_invoice_signatures FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "zatca_sig: org admins insert"
  ON public.zatca_invoice_signatures FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_sig: org admins update"
  ON public.zatca_invoice_signatures FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_sig: org admins delete"
  ON public.zatca_invoice_signatures FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_zatca_invoice_signatures_org ON public.zatca_invoice_signatures(org_id);
CREATE INDEX IF NOT EXISTS idx_zatca_invoice_signatures_invoice ON public.zatca_invoice_signatures(invoice_id);
CREATE INDEX IF NOT EXISTS idx_zatca_invoice_signatures_status ON public.zatca_invoice_signatures(submission_status);

DROP TRIGGER IF EXISTS trg_zatca_invoice_signatures_updated ON public.zatca_invoice_signatures;
CREATE TRIGGER trg_zatca_invoice_signatures_updated
  BEFORE UPDATE ON public.zatca_invoice_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
