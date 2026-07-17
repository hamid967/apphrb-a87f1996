DROP POLICY IF EXISTS "anyone can insert intro events" ON public.intro_events;
CREATE POLICY "anyone can insert intro events"
  ON public.intro_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    event IN ('shown','skipped','completed','cta_click')
    AND coalesce(length(session_id), 0) BETWEEN 1 AND 128
    AND coalesce(length(path), 0) <= 512
    AND coalesce(length(user_agent), 0) <= 512
  );