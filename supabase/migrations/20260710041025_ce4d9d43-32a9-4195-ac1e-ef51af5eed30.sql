
-- Tighten cross-tenant role bypass on expense/notification/profile policies.
-- Replace unscoped global 'admin' access with super_admin only; org members
-- still have their existing scoped policies.

-- expense_batches
DROP POLICY IF EXISTS "admins view any batch" ON public.expense_batches;
DROP POLICY IF EXISTS "admins update any batch" ON public.expense_batches;

CREATE POLICY "super admins view any batch"
ON public.expense_batches FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super admins update any batch"
ON public.expense_batches FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- expense_claims
DROP POLICY IF EXISTS "admins view any claim" ON public.expense_claims;
DROP POLICY IF EXISTS "admins update any claim" ON public.expense_claims;

CREATE POLICY "super admins view any claim"
ON public.expense_claims FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super admins update any claim"
ON public.expense_claims FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- notification_queue: remove global 'admin' bypass on read.
DROP POLICY IF EXISTS "notification queue scoped read" ON public.notification_queue;

CREATE POLICY "notification queue scoped read"
ON public.notification_queue FOR SELECT
USING (
  recipient_user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = notification_queue.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner'::org_role, 'admin'::org_role)
  )
);

-- profiles: remove global 'finance' unscoped update bypass; keep super_admin.
DROP POLICY IF EXISTS "profiles staff update" ON public.profiles;

CREATE POLICY "profiles staff update"
ON public.profiles FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
