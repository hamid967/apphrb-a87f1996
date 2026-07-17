
-- 1) Restrict assistant_messages SELECT to authenticated only
DROP POLICY IF EXISTS "own thread msgs select" ON public.assistant_messages;
CREATE POLICY "own thread msgs select"
ON public.assistant_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assistant_threads t
    WHERE t.id = assistant_messages.thread_id
      AND t.user_id = auth.uid()
  )
);

-- 2) Tighten notification enqueue: users can only enqueue notifications
--    for themselves; org owners/admins and super_admins can enqueue for any
--    member of the org they administer.
DROP POLICY IF EXISTS "org members enqueue notifications" ON public.notification_queue;
CREATE POLICY "users enqueue self notifications"
ON public.notification_queue
FOR INSERT
TO authenticated
WITH CHECK (
  recipient_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = notification_queue.org_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "org admins enqueue member notifications"
ON public.notification_queue
FOR INSERT
TO authenticated
WITH CHECK (
  (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role])
  )
  AND EXISTS (
    SELECT 1 FROM public.organization_members rm
    WHERE rm.org_id = notification_queue.org_id
      AND rm.user_id = notification_queue.recipient_user_id
  )
);
