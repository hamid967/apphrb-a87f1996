DROP POLICY IF EXISTS "own thread msgs select" ON public.assistant_messages;
CREATE POLICY "own thread msgs select"
ON public.assistant_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assistant_threads t
    WHERE t.id = assistant_messages.thread_id
      AND t.user_id = auth.uid()
  )
);