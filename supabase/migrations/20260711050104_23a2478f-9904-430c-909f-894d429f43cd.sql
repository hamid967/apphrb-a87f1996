DROP POLICY IF EXISTS "application_docs_anon_insert" ON storage.objects;

CREATE POLICY "application_docs_anon_insert"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'application-documents'
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[3] IS NOT NULL
  AND char_length(name) <= 512
  AND lower(name) ~ '\.(pdf|jpg|jpeg|png|webp|heic)$'
  AND EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id::text = (storage.foldername(name))[2]
      AND l.org_id::text = (storage.foldername(name))[1]
      AND l.published = true
  )
);