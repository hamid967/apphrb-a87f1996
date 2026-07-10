-- Drop the over-permissive admin policies
DROP POLICY IF EXISTS "user_roles admin insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles admin update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles admin delete" ON public.user_roles;

-- INSERT: super_admin can grant any role; admin can grant only non-super_admin
-- roles, and never to themselves (prevents self-elevation).
CREATE POLICY "user_roles super_admin insert"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "user_roles admin insert non_super"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND user_id <> auth.uid()
  );

-- UPDATE: same rule — modifying a super_admin row (before or after) requires
-- super_admin. Admin can only touch non-super_admin rows.
CREATE POLICY "user_roles super_admin update"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "user_roles admin update non_super"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND user_id <> auth.uid()
  );

-- DELETE: revoking a super_admin requires super_admin.
CREATE POLICY "user_roles super_admin delete"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "user_roles admin delete non_super"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND user_id <> auth.uid()
  );