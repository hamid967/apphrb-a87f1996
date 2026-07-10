
-- 1) Narrow notification admin policies from public -> authenticated
DROP POLICY IF EXISTS "channel settings admin write" ON public.notification_channel_settings;
CREATE POLICY "channel settings admin write"
ON public.notification_channel_settings
FOR ALL
TO authenticated
USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]))
WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "notif templates admin write" ON public.notification_templates;
CREATE POLICY "notif templates admin write"
ON public.notification_templates
FOR ALL
TO authenticated
USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]))
WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]));

-- 2) Add WITH CHECK to profiles staff update so finance role cannot mutate sensitive fields
DROP POLICY IF EXISTS "profiles staff update" ON public.profiles;
CREATE POLICY "profiles staff update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'finance'::app_role]))
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'finance'::app_role])
  AND (
    -- Super admins bypass the column-level restrictions
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      -- Finance role: block changes to sensitive/authorization columns
      NOT (owner_id IS DISTINCT FROM (SELECT p.owner_id FROM public.profiles p WHERE p.id = profiles.id))
      AND NOT (tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = profiles.id))
      AND NOT (approval_status IS DISTINCT FROM (SELECT p.approval_status FROM public.profiles p WHERE p.id = profiles.id))
      AND NOT (permissions IS DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.id = profiles.id))
      AND NOT (approved_by IS DISTINCT FROM (SELECT p.approved_by FROM public.profiles p WHERE p.id = profiles.id))
      AND NOT (approved_at IS DISTINCT FROM (SELECT p.approved_at FROM public.profiles p WHERE p.id = profiles.id))
      AND NOT (manager_id IS DISTINCT FROM (SELECT p.manager_id FROM public.profiles p WHERE p.id = profiles.id))
    )
  )
);
