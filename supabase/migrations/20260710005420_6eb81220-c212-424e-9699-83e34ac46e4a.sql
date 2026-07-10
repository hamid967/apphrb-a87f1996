
-- M3: Convert user-facing SECURITY DEFINER functions to SECURITY INVOKER,
-- so that RLS on the underlying tables governs access. Callers still need
-- their org membership / super_admin overrides, enforced by existing policies.
--
-- Scope (9 functions):
--   tenant_pay_charge, generate_owner_statement, generate_rent_charges,
--   approve_rental_application, submit_rental_application (2 overloads),
--   next_org_sequence, log_assistant_access, my_permissions, my_access_status
--
-- Explicitly NOT converted (must stay DEFINER):
--   * RLS helpers (has_role, has_any_role, has_permission, is_org_*,
--     is_linked_*, is_owner_of_contract, is_company_member,
--     get_my_company_id, get_my_role) — needed to avoid RLS recursion.
--   * Invitation / onboarding / cross-user writes (accept_org_invitation,
--     accept_portal_invitation, get_invitation_by_token,
--     get_portal_invitation_by_token, register_company, handle_new_user,
--     handle_new_organization, notify_user, log_audit, log_soft_delete,
--     record_login_event, check_login_rate_limit).
--   * Trigger functions (tg_*) — invoked in trigger context.
--   * Admin/cron/queue functions guarded by has_role('super_admin')
--     or restricted to service_role (locked down in M2).

ALTER FUNCTION public.tenant_pay_charge(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.generate_owner_statement(uuid, date, numeric) SECURITY INVOKER;
ALTER FUNCTION public.generate_rent_charges(uuid, integer) SECURITY INVOKER;
ALTER FUNCTION public.approve_rental_application(uuid, uuid, date, date, numeric) SECURITY INVOKER;
ALTER FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean) SECURITY INVOKER;
ALTER FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean, text, text, text, smallint, numeric) SECURITY INVOKER;
ALTER FUNCTION public.next_org_sequence(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.log_assistant_access(uuid, text, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.my_permissions(uuid) SECURITY INVOKER;
ALTER FUNCTION public.my_access_status() SECURITY INVOKER;

-- Document the intent so future audits skip re-flagging these as "definer risk".
COMMENT ON FUNCTION public.tenant_pay_charge(uuid, uuid)
  IS 'M3: SECURITY INVOKER. Relies on RLS: rent_charges (tenant-linked read) + payments (org member write).';
COMMENT ON FUNCTION public.generate_owner_statement(uuid, date, numeric)
  IS 'M3: SECURITY INVOKER. Relies on RLS: owner_statements/owner_statement_lines org-scoped policies.';
COMMENT ON FUNCTION public.generate_rent_charges(uuid, integer)
  IS 'M3: SECURITY INVOKER. Relies on RLS: contracts read + rent_charges write by org member.';
COMMENT ON FUNCTION public.approve_rental_application(uuid, uuid, date, date, numeric)
  IS 'M3: SECURITY INVOKER. Body still checks is_org_member; tenants/contracts/rental_applications RLS enforce writes.';
COMMENT ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean)
  IS 'M3: SECURITY INVOKER. Public submit path — rental_applications RLS controls insert.';
COMMENT ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean, text, text, text, smallint, numeric)
  IS 'M3: SECURITY INVOKER. Public submit path — rental_applications RLS controls insert.';
COMMENT ON FUNCTION public.next_org_sequence(uuid, text)
  IS 'M3: SECURITY INVOKER. Relies on org_sequences RLS scoped to org membership.';
COMMENT ON FUNCTION public.log_assistant_access(uuid, text, jsonb)
  IS 'M3: SECURITY INVOKER. Relies on assistant_* RLS scoped to caller org.';
COMMENT ON FUNCTION public.my_permissions(uuid)
  IS 'M3: SECURITY INVOKER. Read-only self helper; underlying rbac_* tables enforce RLS.';
COMMENT ON FUNCTION public.my_access_status()
  IS 'M3: SECURITY INVOKER. Read-only self helper.';
