
-- 1) Fix tautological rental_applications insert policy
DROP POLICY IF EXISTS apps_public_insert ON public.rental_applications;
CREATE POLICY apps_public_insert ON public.rental_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = rental_applications.listing_id
        AND l.published = true
        AND l.org_id = rental_applications.org_id
    )
  );

-- 2) Restrict employees writes to admins/owners; keep read for org members
DROP POLICY IF EXISTS "employees org access" ON public.employees;
CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY employees_write ON public.employees
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

-- 3) Add DELETE policy for receipts storage bucket
DROP POLICY IF EXISTS "receipts owner delete" ON storage.objects;
CREATE POLICY "receipts owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_any_role(auth.uid(), ARRAY['admin','finance']::app_role[])
    )
  );
