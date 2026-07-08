-- 1. Auctions: enforce org scope on public read
DROP POLICY IF EXISTS "auctions public read" ON public.auctions;
CREATE POLICY "auctions org read"
ON public.auctions
FOR SELECT
TO authenticated
USING (
  status = ANY (ARRAY['scheduled','live','ended'])
  AND public.is_org_member(org_id, auth.uid())
);

-- 2. Auction bids: require org membership on insert
DROP POLICY IF EXISTS "bids self insert" ON public.auction_bids;
CREATE POLICY "bids self insert"
ON public.auction_bids
FOR INSERT
TO authenticated
WITH CHECK (
  bidder_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.auctions a
    WHERE a.id = auction_id
      AND public.is_org_member(a.org_id, auth.uid())
  )
);

-- 3. Notification queue: restrict SELECT to admins or recipient
DROP POLICY IF EXISTS "org members read notification queue" ON public.notification_queue;
CREATE POLICY "notification queue scoped read"
ON public.notification_queue
FOR SELECT
TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- 4. Storage: tighten owner statement PDF policy with org check
DROP POLICY IF EXISTS "owners read own statement pdfs" ON storage.objects;
CREATE POLICY "owners read own statement pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'owner-statements'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.owner_id::text = (storage.foldername(objects.name))[2]
      AND public.is_org_member(
        ((storage.foldername(objects.name))[1])::uuid,
        auth.uid()
      )
  )
);

-- 5. Revoke EXECUTE on SECURITY DEFINER public functions from anon & PUBLIC
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS fn_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name, fn.fn_name, fn.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
      fn.schema_name, fn.fn_name, fn.args
    );
  END LOOP;
END $$;