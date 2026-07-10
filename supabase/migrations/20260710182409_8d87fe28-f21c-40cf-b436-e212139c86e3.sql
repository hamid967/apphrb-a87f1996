
-- expense_claims
DROP POLICY IF EXISTS "super admins update any claim" ON public.expense_claims;
CREATE POLICY "super admins update any claim" ON public.expense_claims
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "super admins view any claim" ON public.expense_claims;
CREATE POLICY "super admins view any claim" ON public.expense_claims
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- expense_batches
DROP POLICY IF EXISTS "super admins update any batch" ON public.expense_batches;
CREATE POLICY "super admins update any batch" ON public.expense_batches
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "super admins view any batch" ON public.expense_batches;
CREATE POLICY "super admins view any batch" ON public.expense_batches
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- invoice_notes
DROP POLICY IF EXISTS "invoice_notes: admin delete" ON public.invoice_notes;
CREATE POLICY "invoice_notes: admin delete" ON public.invoice_notes
  FOR DELETE TO authenticated
  USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "invoice_notes: members read" ON public.invoice_notes;
CREATE POLICY "invoice_notes: members read" ON public.invoice_notes
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "invoice_notes: staff insert" ON public.invoice_notes;
CREATE POLICY "invoice_notes: staff insert" ON public.invoice_notes
  FOR INSERT TO authenticated
  WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]));

DROP POLICY IF EXISTS "invoice_notes: staff update" ON public.invoice_notes;
CREATE POLICY "invoice_notes: staff update" ON public.invoice_notes
  FOR UPDATE TO authenticated
  USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]))
  WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]));

-- notification_queue
DROP POLICY IF EXISTS "notification queue scoped read" ON public.notification_queue;
CREATE POLICY "notification queue scoped read" ON public.notification_queue
  FOR SELECT TO authenticated
  USING (
    (recipient_user_id = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.org_id = notification_queue.org_id
        AND m.user_id = auth.uid()
        AND m.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role])
    )
  );

-- profiles
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    (auth.uid() = id)
    AND (NOT (owner_id IS DISTINCT FROM (SELECT p.owner_id FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (approval_status IS DISTINCT FROM (SELECT p.approval_status FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (permissions IS DISTINCT FROM (SELECT p.permissions FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (approved_by IS DISTINCT FROM (SELECT p.approved_by FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (approved_at IS DISTINCT FROM (SELECT p.approved_at FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (trial_ends_at IS DISTINCT FROM (SELECT p.trial_ends_at FROM profiles p WHERE p.id = auth.uid())))
    AND (NOT (manager_id IS DISTINCT FROM (SELECT p.manager_id FROM profiles p WHERE p.id = auth.uid())))
  );

DROP POLICY IF EXISTS "profiles staff update" ON public.profiles;
CREATE POLICY "profiles staff update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- user_devices
DROP POLICY IF EXISTS "own devices" ON public.user_devices;
CREATE POLICY "own devices" ON public.user_devices
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
