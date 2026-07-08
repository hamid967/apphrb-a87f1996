
CREATE TABLE public.assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'محادثة جديدة',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_threads TO authenticated;
GRANT ALL ON public.assistant_threads TO service_role;
ALTER TABLE public.assistant_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads select" ON public.assistant_threads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_admin(org_id, auth.uid())));
CREATE POLICY "own threads insert" ON public.assistant_threads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own threads update" ON public.assistant_threads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own threads delete" ON public.assistant_threads FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER trg_assistant_threads_updated BEFORE UPDATE ON public.assistant_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own thread msgs select" ON public.assistant_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id
    AND (t.user_id = auth.uid() OR (t.org_id IS NOT NULL AND public.is_org_admin(t.org_id, auth.uid())))));
CREATE POLICY "own thread msgs insert" ON public.assistant_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "own thread msgs delete" ON public.assistant_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE INDEX idx_assistant_messages_thread ON public.assistant_messages(thread_id, created_at);
CREATE INDEX idx_assistant_threads_user ON public.assistant_threads(user_id, updated_at DESC);
