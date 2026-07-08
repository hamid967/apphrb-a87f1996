
-- Path convention: {property_id}/{filename}
CREATE POLICY "org members view property images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-images'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = split_part(name, '/', 1)
        AND public.is_org_member(p.org_id, auth.uid())
    )
  );

CREATE POLICY "editors insert property images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-images'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = split_part(name, '/', 1)
        AND public.has_org_role(p.org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[])
    )
  );

CREATE POLICY "editors update property images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-images'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = split_part(name, '/', 1)
        AND public.has_org_role(p.org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[])
    )
  );

CREATE POLICY "editors delete property images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-images'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = split_part(name, '/', 1)
        AND public.has_org_role(p.org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[])
    )
  );
