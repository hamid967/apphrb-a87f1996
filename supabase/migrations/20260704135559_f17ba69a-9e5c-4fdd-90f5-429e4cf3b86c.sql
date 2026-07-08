DROP POLICY IF EXISTS "Public read property images" ON storage.objects;

CREATE POLICY "Public read property images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'property-images'
  AND EXISTS (
    SELECT 1
      FROM public.property_images pi
      JOIN public.properties p ON p.id = pi.property_id
     WHERE (
       (storage.foldername(objects.name))[1] = pi.property_id::text
       OR pi.storage_path = objects.name
     )
       AND p.is_public = true
  )
);