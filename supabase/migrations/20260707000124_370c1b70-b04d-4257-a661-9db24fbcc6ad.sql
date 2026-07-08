
ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient_user
  ON public.notification_queue (recipient_user_id);

DROP POLICY IF EXISTS "creator updates own notification" ON public.notification_queue;
CREATE POLICY "creator updates own notification"
  ON public.notification_queue
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
