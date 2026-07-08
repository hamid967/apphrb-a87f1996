
CREATE TRIGGER audit_rbac_roles
AFTER INSERT OR UPDATE OR DELETE ON public.rbac_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

CREATE TRIGGER audit_rbac_role_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.rbac_role_permissions
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

CREATE TRIGGER audit_rbac_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.rbac_user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

CREATE POLICY "audit rbac org admin read" ON public.audit_log
FOR SELECT TO authenticated
USING (
  entity IN ('rbac_roles','rbac_role_permissions','rbac_user_roles')
  AND (diff->>'org_id') IS NOT NULL
  AND public.is_org_admin(((diff->>'org_id')::uuid), auth.uid())
);
