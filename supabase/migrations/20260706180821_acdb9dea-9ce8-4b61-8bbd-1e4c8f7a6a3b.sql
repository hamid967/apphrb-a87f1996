
-- 1. Restrict bids read on published to org members only
DROP POLICY IF EXISTS "bids read on published" ON public.auction_bids;
CREATE POLICY "bids read on published" ON public.auction_bids
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.auctions a
    WHERE a.id = auction_bids.auction_id
      AND a.status = ANY (ARRAY['scheduled'::text,'live'::text,'ended'::text])
      AND is_org_member(a.org_id, auth.uid())
  )
);

-- 2. Restrict notification_channel_settings writes to owners/admins
DROP POLICY IF EXISTS "channel settings org write" ON public.notification_channel_settings;
CREATE POLICY "channel settings admin write" ON public.notification_channel_settings
FOR ALL
USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]))
WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]));

-- 3. Restrict notification_templates writes to owners/admins
DROP POLICY IF EXISTS "notif templates org write" ON public.notification_templates;
CREATE POLICY "notif templates admin write" ON public.notification_templates
FOR ALL
USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]))
WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]));

-- 4. Owner-statement storage: allow org admins/owners to insert/update/delete
CREATE POLICY "org admins insert owner statement pdfs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::org_role,'admin'::org_role)
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "org admins update owner statement pdfs" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::org_role,'admin'::org_role)
      AND m.org_id::text = (storage.foldername(objects.name))[1]
  )
)
WITH CHECK (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::org_role,'admin'::org_role)
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "org admins delete owner statement pdfs" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::org_role,'admin'::org_role)
      AND m.org_id::text = (storage.foldername(objects.name))[1]
  )
);
