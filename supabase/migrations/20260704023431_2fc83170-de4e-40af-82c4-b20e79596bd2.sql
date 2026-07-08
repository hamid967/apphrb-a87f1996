-- =========================================================
-- 1) Storage: restrict org-logos INSERT/DELETE to org admins
-- =========================================================
DROP POLICY IF EXISTS "org members write logos"  ON storage.objects;
DROP POLICY IF EXISTS "org members delete logos" ON storage.objects;

CREATE POLICY "org admins write logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
        AND m.org_id::text = (storage.foldername(objects.name))[1]
    )
  );

CREATE POLICY "org admins delete logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
        AND m.org_id::text = (storage.foldername(objects.name))[1]
    )
  );

-- =========================================================
-- 2) Pin search_path on definer functions missing it
--    (pgmq wrappers)
-- =========================================================
ALTER FUNCTION public.enqueue_email(text, jsonb)                                SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint)                                SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer)                  SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)                    SET search_path = public, pgmq;

-- =========================================================
-- 3) Lock down SECURITY DEFINER functions that must not be
--    callable directly from the public API (anon/auth).
--    These are either trigger bodies, internal queue helpers,
--    admin-only bootstrap, or cron/service-role callables.
-- =========================================================

-- Trigger bodies — only fire via triggers, never from PostgREST
REVOKE EXECUTE ON FUNCTION public.tg_assign_contract_number()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_assign_receipt_number()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_log_payment_status_change()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_maintenance_ticket_expense()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_payment_approved()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_payment_notify()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_payment_submitted_notify()    FROM PUBLIC, anon, authenticated;

-- Internal email queue / cron plumbing (called by cron & service role only)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake()                            FROM PUBLIC, anon, authenticated;

-- Admin/seed/bootstrap helpers (must go through server functions with role checks)
REVOKE EXECUTE ON FUNCTION public.approve_site_owner(text, integer)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_core_system()                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_core_system_plan()                       FROM PUBLIC, anon;

-- Anon-lockdown for functions that require auth.uid() anyway
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role()                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_company_id()                           FROM PUBLIC, anon;
