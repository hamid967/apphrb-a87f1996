
-- 1) Restrict SECURITY DEFINER helper to authenticated only
REVOKE EXECUTE ON FUNCTION public.hbspro_has_org_role_text(uuid, uuid, text[]) FROM anon, PUBLIC;

-- 2) Fix subscription-receipts storage policies: replace generic 'admin' with 'super_admin'
DROP POLICY IF EXISTS "receipts: super admin manage" ON storage.objects;
DROP POLICY IF EXISTS "receipts: org admins read own" ON storage.objects;

CREATE POLICY "receipts: super admin manage"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'subscription-receipts' AND public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (bucket_id = 'subscription-receipts' AND public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "receipts: org admins read own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'subscription-receipts'
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.is_org_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );
