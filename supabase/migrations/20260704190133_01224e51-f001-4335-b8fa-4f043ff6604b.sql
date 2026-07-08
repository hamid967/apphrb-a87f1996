DROP POLICY IF EXISTS "org members update logos" ON storage.objects;

CREATE POLICY "org admins update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-logos'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role::text = ANY (ARRAY['owner','admin'])
      AND (m.org_id)::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'org-logos'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role::text = ANY (ARRAY['owner','admin'])
      AND (m.org_id)::text = (storage.foldername(name))[1]
  )
);