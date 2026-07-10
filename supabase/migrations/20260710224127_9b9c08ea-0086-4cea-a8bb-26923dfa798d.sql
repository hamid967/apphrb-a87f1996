
-- 1. Revoke anon/public execute on admin_update_cron_schedule
REVOKE EXECUTE ON FUNCTION public.admin_update_cron_schedule(text, text, boolean) FROM anon, PUBLIC;

-- 2. Set search_path on functions missing it
ALTER FUNCTION public.expense_level_role(integer) SET search_path = public;
ALTER FUNCTION public.tg_push_subs_touch() SET search_path = public;

-- 3. autopay_schedules: split ap_manage into per-command policies restricting SELECT
DROP POLICY IF EXISTS ap_manage ON public.autopay_schedules;

CREATE POLICY ap_select_admin_or_tenant ON public.autopay_schedules
  FOR SELECT TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY ap_insert_admin_or_tenant ON public.autopay_schedules
  FOR INSERT TO authenticated
  WITH CHECK (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY ap_update_admin_or_tenant ON public.autopay_schedules
  FOR UPDATE TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

-- 4. commissions: agents can only insert their own; owner/admin can insert any
DROP POLICY IF EXISTS commissions_insert_editors ON public.commissions;

CREATE POLICY commissions_insert_editors ON public.commissions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role])
    OR (
      has_org_role(org_id, auth.uid(), ARRAY['agent'::org_role])
      AND agent_id = auth.uid()
    )
  );

-- 5. notification_queue: recipient must be in same org, or inserter must be admin/owner/super_admin
DROP POLICY IF EXISTS "org members enqueue notifications" ON public.notification_queue;

CREATE POLICY "org members enqueue notifications" ON public.notification_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.org_id = notification_queue.org_id AND m.user_id = auth.uid()
    )
    AND (
      recipient_user_id = auth.uid()
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_org_role(notification_queue.org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role])
      OR EXISTS (
        SELECT 1 FROM organization_members rm
        WHERE rm.org_id = notification_queue.org_id AND rm.user_id = notification_queue.recipient_user_id
      )
    )
  );
