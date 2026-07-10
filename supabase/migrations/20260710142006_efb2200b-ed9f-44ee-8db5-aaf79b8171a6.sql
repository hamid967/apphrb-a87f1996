
ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_channel_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'in_app'::text, 'push'::text]));
