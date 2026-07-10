CREATE TABLE public.zatca_csid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','simulation','production')),
  csid_binary_token TEXT NOT NULL,
  csid_secret TEXT NOT NULL,
  request_id TEXT,
  disposition_message TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, environment)
);

CREATE INDEX idx_zatca_csid_org ON public.zatca_csid(org_id);
CREATE INDEX idx_zatca_csid_active ON public.zatca_csid(org_id, environment) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zatca_csid TO authenticated;
GRANT ALL ON public.zatca_csid TO service_role;

ALTER TABLE public.zatca_csid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zatca_csid: org admins read"
  ON public.zatca_csid FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_csid: org admins insert"
  ON public.zatca_csid FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_csid: org admins update"
  ON public.zatca_csid FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_csid: org admins delete"
  ON public.zatca_csid FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

CREATE TRIGGER trg_zatca_csid_updated_at
  BEFORE UPDATE ON public.zatca_csid
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.zatca_submission_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL DEFAULT 1,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','cleared','reported','warning','rejected','error')),
  http_status INT,
  clearance_uuid TEXT,
  response_body JSONB,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, attempt_no)
);

CREATE INDEX idx_zatca_attempts_invoice ON public.zatca_submission_attempts(invoice_id, attempt_no DESC);
CREATE INDEX idx_zatca_attempts_org_status ON public.zatca_submission_attempts(org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zatca_submission_attempts TO authenticated;
GRANT ALL ON public.zatca_submission_attempts TO service_role;

ALTER TABLE public.zatca_submission_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zatca_attempts: org members read"
  ON public.zatca_submission_attempts FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "zatca_attempts: org admins insert"
  ON public.zatca_submission_attempts FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_attempts: org admins update"
  ON public.zatca_submission_attempts FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
CREATE POLICY "zatca_attempts: org admins delete"
  ON public.zatca_submission_attempts FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));