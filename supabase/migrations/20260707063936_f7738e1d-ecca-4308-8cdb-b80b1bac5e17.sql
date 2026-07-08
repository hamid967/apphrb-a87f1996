ALTER TABLE public.user_notification_event_prefs
  DROP CONSTRAINT IF EXISTS user_notification_event_prefs_channel_check;
ALTER TABLE public.user_notification_event_prefs
  ADD CONSTRAINT user_notification_event_prefs_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text, 'push'::text, 'in_app'::text]));