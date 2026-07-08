
CREATE TABLE public.intro_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('shown','skipped','completed')),
  user_agent TEXT,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX intro_events_session_idx ON public.intro_events(session_id);
CREATE INDEX intro_events_event_idx ON public.intro_events(event, created_at DESC);

GRANT INSERT ON public.intro_events TO anon, authenticated;
GRANT SELECT ON public.intro_events TO authenticated;
GRANT ALL ON public.intro_events TO service_role;

ALTER TABLE public.intro_events ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous visitors) may log their own intro event.
CREATE POLICY "anyone can insert intro events"
  ON public.intro_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only super admins can read the analytics.
CREATE POLICY "super_admin can read intro events"
  ON public.intro_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
