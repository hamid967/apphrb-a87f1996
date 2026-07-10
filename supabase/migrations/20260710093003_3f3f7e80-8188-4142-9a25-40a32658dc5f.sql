-- Add read_at to notification_queue for in-app notification center
ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient_read
  ON public.notification_queue (recipient_user_id, read_at, created_at DESC);

-- Allow the recipient to update read_at on their own notifications
DROP POLICY IF EXISTS "recipient marks own notification read" ON public.notification_queue;
CREATE POLICY "recipient marks own notification read"
  ON public.notification_queue
  FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
