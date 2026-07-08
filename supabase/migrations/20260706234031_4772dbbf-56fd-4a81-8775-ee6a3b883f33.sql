CREATE TABLE public.user_notification_event_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','sms','push')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, event_key, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_event_prefs TO authenticated;
GRANT ALL ON public.user_notification_event_prefs TO service_role;

ALTER TABLE public.user_notification_event_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own prefs"
  ON public.user_notification_event_prefs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_notification_event_prefs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_notification_event_prefs_updated_at
BEFORE UPDATE ON public.user_notification_event_prefs
FOR EACH ROW EXECUTE FUNCTION public.touch_user_notification_event_prefs_updated_at();