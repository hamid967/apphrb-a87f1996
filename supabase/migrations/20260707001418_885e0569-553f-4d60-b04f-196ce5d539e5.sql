
ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS failed_permanent_at TIMESTAMPTZ;

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_status_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'pending_credentials'::text,
    'sent'::text,
    'failed'::text,
    'skipped'::text,
    'dead_letter'::text
  ]));

CREATE INDEX IF NOT EXISTS idx_notification_queue_dead_letter
  ON public.notification_queue (created_at DESC)
  WHERE status = 'dead_letter';

CREATE OR REPLACE FUNCTION public.claim_pending_notifications(
  _limit INTEGER DEFAULT 25,
  _max_attempts INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  channel TEXT,
  recipient TEXT,
  template TEXT,
  variables JSONB,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT nq.id
    FROM public.notification_queue nq
    WHERE nq.status IN ('pending', 'failed')
      AND nq.attempts < _max_attempts
      AND (
        nq.last_attempt_at IS NULL
        OR nq.last_attempt_at < now() - (interval '1 minute' * power(2, nq.attempts))
      )
    ORDER BY nq.created_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.notification_queue nq
    SET status = 'pending',
        last_attempt_at = now()
    FROM due
    WHERE nq.id = due.id
    RETURNING nq.id, nq.channel, nq.recipient, nq.template, nq.variables, nq.attempts
  )
  SELECT c.id, c.channel, c.recipient, c.template, c.variables, c.attempts FROM claimed c;
END;
$$;
