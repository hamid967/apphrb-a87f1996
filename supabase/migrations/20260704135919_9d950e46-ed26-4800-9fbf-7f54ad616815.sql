ALTER TABLE public.assistant_messages ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('up','down'));

CREATE POLICY "Users update feedback on own thread messages"
ON public.assistant_messages FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = assistant_messages.thread_id AND t.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = assistant_messages.thread_id AND t.user_id = auth.uid()));