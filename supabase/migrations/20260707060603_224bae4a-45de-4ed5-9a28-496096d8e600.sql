-- RLS policies for the application-documents storage bucket.
-- Path convention: {org_id}/{listing_id}/{filename}
-- - anon (public applicants) may INSERT into any {org_id}/{listing_id}/* whose listing is published
-- - org members may SELECT files that belong to their org (first path segment = org_id)
-- - org admins may DELETE files that belong to their org

-- Public upload by anon: only into a published listing's folder
CREATE POLICY "application_docs_anon_insert"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'application-documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id::text = (storage.foldername(name))[2]
      AND l.org_id::text = (storage.foldername(name))[1]
      AND l.published = true
  )
);

-- Org members can read files from their org
CREATE POLICY "application_docs_org_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'application-documents'
  AND public.is_org_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- Org admins can delete files from their org
CREATE POLICY "application_docs_org_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'application-documents'
  AND public.is_org_admin(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);
