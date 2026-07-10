
CREATE TABLE IF NOT EXISTS public.cron_hook_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_name text NOT NULL,
  attempt smallint NOT NULL DEFAULT 1,
  max_attempts smallint NOT NULL DEFAULT 3,
  status text NOT NULL CHECK (status IN ('success','failed','exhausted')),
  duration_ms integer,
  summary jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cron_hook_runs TO authenticated;
GRANT ALL ON public.cron_hook_runs TO service_role;

ALTER TABLE public.cron_hook_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_hook_runs: super_admin can read"
  ON public.cron_hook_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE INDEX IF NOT EXISTS cron_hook_runs_hook_started_idx
  ON public.cron_hook_runs (hook_name, started_at DESC);
