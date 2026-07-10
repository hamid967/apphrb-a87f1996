ALTER TABLE public.user_notification_event_prefs
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'instant';

ALTER TABLE public.user_notification_event_prefs
  DROP CONSTRAINT IF EXISTS user_notification_event_prefs_frequency_check;
ALTER TABLE public.user_notification_event_prefs
  ADD CONSTRAINT user_notification_event_prefs_frequency_check
  CHECK (frequency IN ('instant','daily','weekly','off'));