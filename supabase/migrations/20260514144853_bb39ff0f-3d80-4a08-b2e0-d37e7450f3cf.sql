
-- 1. Fix mutable search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin new.updated_at = now(); return new; end;
$$;

-- 2. Tighten permissive RLS policies
DROP POLICY IF EXISTS "audit insert" ON public.audit_log;
CREATE POLICY "audit insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor = auth.uid());

DROP POLICY IF EXISTS "violations system insert" ON public.policy_violations;
CREATE POLICY "violations system insert" ON public.policy_violations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = policy_violations.expense_id
        AND (e.user_id = auth.uid()
             OR public.has_any_role(auth.uid(), ARRAY['manager','finance','admin']::app_role[]))
    )
  );

DROP POLICY IF EXISTS "violations system delete" ON public.policy_violations;
CREATE POLICY "violations system delete" ON public.policy_violations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = policy_violations.expense_id
        AND (e.user_id = auth.uid()
             OR public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[]))
    )
  );

-- 3. Revoke public execute on SECURITY DEFINER helpers (only used internally by RLS / triggers)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
