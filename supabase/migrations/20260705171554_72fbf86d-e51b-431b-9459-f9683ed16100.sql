-- RLS on storage.objects for the private `report-exports` bucket.
-- Object key layout: {company_id}/{run_id}.{ext}

CREATE POLICY "report_exports_select_member"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "report_exports_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-exports'
    AND public.has_role(auth.uid(), 'admin')
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "report_exports_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND public.has_role(auth.uid(), 'admin')
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "report_exports_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND public.has_role(auth.uid(), 'admin')
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
