
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

REVOKE ALL ON FUNCTION public.claim_pending_notifications(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(INTEGER, INTEGER) TO service_role;
