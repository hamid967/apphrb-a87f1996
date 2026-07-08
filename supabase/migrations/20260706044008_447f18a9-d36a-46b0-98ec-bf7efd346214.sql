
DROP POLICY IF EXISTS "system events admin read" ON public.system_events;
CREATE POLICY "system events admin read" ON public.system_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );
