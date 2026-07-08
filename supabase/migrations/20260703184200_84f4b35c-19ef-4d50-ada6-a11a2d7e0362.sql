CREATE POLICY "receipts: org admins upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subscription-receipts'
    AND public.is_org_admin(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "receipts: org admins read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'subscription-receipts'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.is_org_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );

CREATE POLICY "receipts: super admin manage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'subscription-receipts' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'subscription-receipts' AND public.has_role(auth.uid(),'admin'));