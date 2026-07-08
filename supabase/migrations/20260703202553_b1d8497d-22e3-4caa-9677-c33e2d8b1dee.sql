-- Revoke EXECUTE from anon/authenticated on internal SECURITY DEFINER functions
-- that should not be callable from the API. service_role retains access.

-- Trigger functions (only used by triggers, never called via API)
REVOKE ALL ON FUNCTION public.tg_contract_activated() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_profiles_block_link_selfassign() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_profiles_block_link_selfinsert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_check_spending_policy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_validate_autopay_day() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_profiles_restrict_approval_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_audit_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_site_owner_hamid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_hamid_new_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete(regclass, uuid) FROM PUBLIC, anon, authenticated;

-- Admin-only privileged operations (internally check has_role='admin'; safe to
-- block at API layer too so anon/authenticated can't even attempt to call)
REVOKE ALL ON FUNCTION public.approve_user_trial(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_app_setting(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_reminders_scan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[]) FROM PUBLIC, anon, authenticated;

-- Seed/demo utilities (should never be callable from the API in production)
REVOKE ALL ON FUNCTION public.seed_demo_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_expense_claims() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_report_templates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_appfolio_demo() FROM PUBLIC, anon, authenticated;

-- Owner statement generator and rent-charge generator: admin-only, internally
-- checked. Restrict at the API layer.
REVOKE ALL ON FUNCTION public.generate_owner_statement(uuid, date, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_rent_charges(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Assistant access audit helper (internal)
REVOKE ALL ON FUNCTION public.log_assistant_access(uuid, text, jsonb) FROM PUBLIC, anon;

-- Ensure service_role keeps access to the ones it may invoke on behalf of jobs
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_reminders_scan() TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_user_trial(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_app_setting(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_expense_claims() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_report_templates() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_appfolio_demo() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_owner_statement(uuid, date, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_rent_charges(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[]) TO service_role;
