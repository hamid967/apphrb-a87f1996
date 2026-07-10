
-- =========================================================================
-- M1: SECURITY DEFINER hardening — full REVOKE sweep + explicit closures
-- =========================================================================
-- Trigger-invoked SECURITY DEFINER functions run under the table owner
-- regardless of EXECUTE grants on the function itself, so revoking EXECUTE
-- from anon/authenticated does NOT break trigger firing. It only closes the
-- direct PostgREST/Data-API surface (`/rest/v1/rpc/<fn>`).
-- =========================================================================

-- 1) Blanket revoke on every function in public from public roles.
--    This is the "default deny" baseline; we then re-grant selectively.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) Re-grant EXECUTE on well-known safe helper functions that the app
--    (client + server middleware) calls via RPC. These are read-only
--    role/permission checks used across policies and UI guards.
DO $$
DECLARE
  fn TEXT;
  sig TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'has_role',
    'is_super_admin',
    'current_user_company_id',
    'get_current_user_company_id',
    'get_user_role',
    'user_has_permission',
    'has_permission'
  ] LOOP
    FOR sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    END LOOP;
  END LOOP;
END $$;

-- 3) Explicit closures for the five high-risk SECURITY DEFINER functions.
--    The blanket revoke already handles them, but we restate here so the
--    intent is documented in this migration and any future re-grant is a
--    conscious decision, not an accident.

REVOKE ALL ON FUNCTION public.leads_log_activity()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticket_apply_sla()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticket_assign_number()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zatca_chain_audit(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zatca_next_counter(uuid)    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leads_log_activity()     TO service_role;
GRANT EXECUTE ON FUNCTION public.ticket_apply_sla()       TO service_role;
GRANT EXECUTE ON FUNCTION public.ticket_assign_number()   TO service_role;
GRANT EXECUTE ON FUNCTION public.zatca_chain_audit(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.zatca_next_counter(uuid) TO service_role;

COMMENT ON FUNCTION public.leads_log_activity() IS
  'M1-closed: trigger-only SECURITY DEFINER. Direct RPC blocked. Fires via BEFORE/AFTER triggers on leads-related tables under table-owner privileges.';
COMMENT ON FUNCTION public.ticket_apply_sla() IS
  'M1-closed: trigger-only SECURITY DEFINER. Direct RPC blocked. Fires via triggers on support_tickets to compute SLA.';
COMMENT ON FUNCTION public.ticket_assign_number() IS
  'M1-closed: trigger-only SECURITY DEFINER. Direct RPC blocked. Fires via BEFORE INSERT trigger on support_tickets.';
COMMENT ON FUNCTION public.zatca_chain_audit(uuid) IS
  'M1-closed: admin/service_role only. Direct RPC blocked. Call from server functions via supabaseAdmin after has_role(super_admin) check.';
COMMENT ON FUNCTION public.zatca_next_counter(uuid) IS
  'M1-closed: admin/service_role only. Direct RPC blocked. Call from server functions via supabaseAdmin during ZATCA invoice issuance.';
