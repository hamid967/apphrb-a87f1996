
-- 1) Public read policy on storage.objects for property-images referenced by a public property_images row
CREATE POLICY "Public read property images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'property-images'
  AND EXISTS (
    SELECT 1 FROM public.property_images pi
     WHERE (storage.foldername(name))[1] = pi.property_id::text
        OR pi.storage_path = name
  )
);

-- 2) Lock down SECURITY DEFINER function EXECUTE grants
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_linked_tenant(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_linked_property_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_profiles_block_link_selfassign() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_profiles_block_link_selfinsert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_check_spending_policy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_validate_autopay_day() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_site_owner_hamid() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_hamid_new_org() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete(regclass, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_reminders_scan() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_user_trial(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_app_setting(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_assistant_access(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.provision_developer_workspace() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_expense_claims() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_appfolio_demo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_report_templates() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_owner_statement(uuid, date, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_rent_charges(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tenant_pay_charge(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_org_invitation(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_access_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_permissions(uuid) FROM PUBLIC, anon;
