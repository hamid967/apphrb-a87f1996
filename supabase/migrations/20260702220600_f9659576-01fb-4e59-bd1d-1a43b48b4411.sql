CREATE TYPE public.export_job_status AS ENUM ('queued','processing','completed','failed');

CREATE TABLE public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  template_id uuid REFERENCES public.report_templates(id) ON DELETE SET NULL,
  format text NOT NULL CHECK (format IN ('csv','json','pdf')),
  status public.export_job_status NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  step text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_data jsonb,
  result_url text,
  error text,
  row_count int,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_jobs TO authenticated;
GRANT ALL ON public.export_jobs TO service_role;

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org export jobs"
  ON public.export_jobs FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Members can create own export jobs"
  ON public.export_jobs FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Owners can update own export jobs"
  ON public.export_jobs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can delete own export jobs"
  ON public.export_jobs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_export_jobs_org_user ON public.export_jobs(org_id, user_id, created_at DESC);
CREATE INDEX idx_export_jobs_status ON public.export_jobs(status);

CREATE TRIGGER trg_export_jobs_updated
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();