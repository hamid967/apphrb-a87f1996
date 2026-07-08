-- Owners read their own statement PDFs.
-- Path convention: {org_id}/{owner_id}/{period}.pdf
CREATE POLICY "owners read own statement pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.owner_id::text = (storage.foldername(name))[2]
  )
);

-- Org staff can list all statements inside their org.
CREATE POLICY "org members read owner statement pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);