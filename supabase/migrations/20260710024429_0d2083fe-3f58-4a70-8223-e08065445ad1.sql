-- 1) audit_log: replace global staff read with super_admin-only global read
DROP POLICY IF EXISTS "audit staff read" ON public.audit_log;
CREATE POLICY "audit super admin read"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 2) receipts storage bucket: remove global role bypass; owner-only reads
DROP POLICY IF EXISTS "receipts user read" ON storage.objects;
CREATE POLICY "receipts owner read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );