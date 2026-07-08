
ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_queue_org_idempotency
  ON public.notification_queue (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
