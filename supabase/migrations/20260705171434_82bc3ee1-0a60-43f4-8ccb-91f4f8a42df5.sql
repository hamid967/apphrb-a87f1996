-- ENUMs
DO $$ BEGIN
  CREATE TYPE public.report_intro_preset AS ENUM ('custom', 'financial', 'operational', 'technical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_export_format AS ENUM ('pdf', 'docx', 'xlsx', 'html');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_run_status AS ENUM ('queued', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: is the current user a member of the org that owns this company?
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.organization_members m ON m.org_id = c.org_id
    WHERE c.id = _company_id AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

-- ============================================================
-- report_templates_intro
-- ============================================================
CREATE TABLE IF NOT EXISTS public.report_templates_intro (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title_ar     text NOT NULL DEFAULT 'مقدمة الإدارة',
  title_en     text NOT NULL DEFAULT 'Management Introduction',
  preset       public.report_intro_preset NOT NULL DEFAULT 'custom',
  rich_content_ar text NOT NULL DEFAULT '',
  rich_content_en text NOT NULL DEFAULT '',
  dynamic_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_report_templates_intro_company
  ON public.report_templates_intro(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates_intro TO authenticated;
GRANT ALL ON public.report_templates_intro TO service_role;

ALTER TABLE public.report_templates_intro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intro_select_admin"
  ON public.report_templates_intro FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

CREATE POLICY "intro_insert_admin"
  ON public.report_templates_intro FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

CREATE POLICY "intro_update_admin"
  ON public.report_templates_intro FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

CREATE POLICY "intro_delete_admin"
  ON public.report_templates_intro FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

-- ============================================================
-- report_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.report_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format                 public.report_export_format NOT NULL,
  status                 public.report_run_status NOT NULL DEFAULT 'queued',
  storage_path           text,
  file_size              bigint,
  checksum               text,
  signed_url_expires_at  timestamptz,
  error                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_runs_company_created
  ON public.report_runs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_runs_status
  ON public.report_runs(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_runs TO authenticated;
GRANT ALL ON public.report_runs TO service_role;

ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runs_select_member"
  ON public.report_runs FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "runs_insert_admin"
  ON public.report_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

CREATE POLICY "runs_update_admin"
  ON public.report_runs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

CREATE POLICY "runs_delete_admin"
  ON public.report_runs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_company_member(company_id));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_report_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_report_intro_updated_at ON public.report_templates_intro;
CREATE TRIGGER trg_report_intro_updated_at
  BEFORE UPDATE ON public.report_templates_intro
  FOR EACH ROW EXECUTE FUNCTION public.tg_report_touch_updated_at();

DROP TRIGGER IF EXISTS trg_report_runs_updated_at ON public.report_runs;
CREATE TRIGGER trg_report_runs_updated_at
  BEFORE UPDATE ON public.report_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_report_touch_updated_at();
