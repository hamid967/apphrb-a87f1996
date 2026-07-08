
CREATE TABLE public.realtime_connection_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  channel_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('disconnect','reconnect','failed')),
  attempt int,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX realtime_connection_events_created_at_idx ON public.realtime_connection_events (created_at DESC);
CREATE INDEX realtime_connection_events_user_channel_idx ON public.realtime_connection_events (user_id, channel_key, created_at DESC);
CREATE INDEX realtime_connection_events_channel_idx ON public.realtime_connection_events (channel_key, created_at DESC);

GRANT SELECT, INSERT ON public.realtime_connection_events TO authenticated;
GRANT ALL ON public.realtime_connection_events TO service_role;

ALTER TABLE public.realtime_connection_events ENABLE ROW LEVEL SECURITY;

-- Users can insert events tied to their own user id.
CREATE POLICY "Users insert own realtime events"
  ON public.realtime_connection_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only super_admin can read the diagnostics log.
CREATE POLICY "Super admin reads realtime events"
  ON public.realtime_connection_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
