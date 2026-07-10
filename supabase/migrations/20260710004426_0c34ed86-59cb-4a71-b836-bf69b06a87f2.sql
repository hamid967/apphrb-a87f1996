
-- =========================================================================
-- M2-cont: super_admin guard on remaining admin functions
-- =========================================================================
DO $migration$
DECLARE
  target_names text[] := ARRAY[
    'bulk_apply_role_template',
    'cleanup_expired_user_roles',
    'provision_developer_workspace',
    'seed_portal_test_users'
  ];
  guard_block  text := E'\n  IF NOT public.has_role(auth.uid(), ''super_admin''::public.app_role) THEN\n    RAISE EXCEPTION ''forbidden: super_admin role required'' USING ERRCODE = ''42501'';\n  END IF;\n';
  rec RECORD;
  def_text text;
  new_def  text;
BEGIN
  FOR rec IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname = ANY(target_names)
      AND p.prosecdef = true
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname='plpgsql')
  LOOP
    IF pg_get_functiondef(rec.oid) ~* 'has_role\s*\(\s*auth\.uid\(\)\s*,\s*''super_admin' THEN
      RAISE NOTICE 'skip %(): already guarded', rec.sig;
      CONTINUE;
    END IF;
    def_text := pg_get_functiondef(rec.oid);
    new_def := regexp_replace(def_text, '(\nBEGIN)(\s|\n)', '\1' || guard_block || '\2', '');
    IF new_def = def_text THEN
      RAISE EXCEPTION 'failed to inject guard into %(): no outer BEGIN matched', rec.sig;
    END IF;
    EXECUTE new_def;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', rec.sig,
      'M2-guarded: requires has_role(auth.uid(), ''super_admin''). RPC access still service_role-only by M1 default; call from server fn via supabaseAdmin.');
    RAISE NOTICE 'guarded %()', rec.sig;
  END LOOP;
END
$migration$;

-- Cron & queue functions: no user context; user-based guard is not applicable.
-- Enforce service_role-only via GRANT (M1 already revoked from anon/authenticated).
-- Document intent explicitly so future refactors don't add a spurious re-grant.
DO $cron_doc$
DECLARE
  cron_names text[] := ARRAY[
    'activate_scheduled_auctions','finalize_expired_auctions',
    'run_daily_transitions','run_reminders_scan',
    'email_queue_dispatch','email_queue_wake','claim_pending_notifications',
    'enqueue_email','delete_email','read_email_batch','move_to_dlq'
  ];
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(cron_names)
  LOOP
    -- Re-assert the revoke as belt-and-braces; harmless if already revoked.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.sig,
      'M2-scoped: system/cron/queue function — no user context. service_role-only. Invoked by pg_cron or verified webhook endpoints via supabaseAdmin.');
  END LOOP;
END
$cron_doc$;
