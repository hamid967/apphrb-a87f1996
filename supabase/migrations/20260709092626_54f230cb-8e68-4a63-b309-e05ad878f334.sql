
CREATE TABLE public.scripts_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text,
  interval_minutes int NOT NULL CHECK (interval_minutes >= 5 AND interval_minutes <= 43200),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  last_duration_ms int,
  run_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scripts_schedules_org_idx ON public.scripts_schedules(org_id);
CREATE INDEX scripts_schedules_due_idx ON public.scripts_schedules(next_run_at) WHERE enabled = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scripts_schedules TO authenticated;
GRANT ALL ON public.scripts_schedules TO service_role;
ALTER TABLE public.scripts_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own org schedules" ON public.scripts_schedules
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "members insert own org schedules" ON public.scripts_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );
CREATE POLICY "members update own org schedules" ON public.scripts_schedules
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "members delete own org schedules" ON public.scripts_schedules
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE TABLE public.scripts_schedule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.scripts_schedules(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_ms int,
  status text NOT NULL,
  result jsonb,
  error text
);
CREATE INDEX scripts_schedule_runs_schedule_idx ON public.scripts_schedule_runs(schedule_id, started_at DESC);
CREATE INDEX scripts_schedule_runs_org_idx ON public.scripts_schedule_runs(org_id, started_at DESC);

GRANT SELECT ON public.scripts_schedule_runs TO authenticated;
GRANT ALL ON public.scripts_schedule_runs TO service_role;
ALTER TABLE public.scripts_schedule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own org runs" ON public.scripts_schedule_runs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.scripts_schedules_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER scripts_schedules_updated_at
  BEFORE UPDATE ON public.scripts_schedules
  FOR EACH ROW EXECUTE FUNCTION public.scripts_schedules_touch_updated_at();
