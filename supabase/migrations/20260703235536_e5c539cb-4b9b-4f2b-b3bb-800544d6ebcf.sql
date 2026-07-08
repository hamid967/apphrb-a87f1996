
CREATE OR REPLACE FUNCTION public.seed_core_system_plan()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  expected_perms text[] := ARRAY[
    'screen.dashboard.view','screen.reports.view','screen.accounting.view','screen.admin.view',
    'company.view','company.manage','branch.view','branch.manage','department.view','department.manage',
    'report.financial.view','report.occupancy.view',
    'export.csv','export.json','export.pdf',
    'import.contacts','import.leads','import.units',
    'api.call','api.keys.manage',
    'button.contract.approve','button.expense.approve','button.payment.refund',
    'field.contract.amount.view','field.owner.bank.view','field.tenant.national_id.view'
  ];
  expected_slugs text[] := ARRAY['core.owner','core.manager','core.viewer'];
  v_missing_perms text[];
  v_missing_roles jsonb;
  v_orgs int;
  v_hamid_uid uuid;
  v_hamid_status text;
  v_hamid_admin boolean;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT array_agg(p) INTO v_missing_perms
    FROM unnest(expected_perms) AS p
   WHERE NOT EXISTS (SELECT 1 FROM public.rbac_permissions WHERE code = p);

  SELECT count(*) INTO v_orgs FROM public.organizations;

  SELECT jsonb_agg(jsonb_build_object('org_id', o.id, 'org', o.name, 'missing_slug', s))
    INTO v_missing_roles
    FROM public.organizations o
    CROSS JOIN unnest(expected_slugs) AS s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.rbac_roles r
      WHERE r.org_id = o.id AND r.slug = s
   );

  SELECT id INTO v_hamid_uid FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com' LIMIT 1;
  IF v_hamid_uid IS NOT NULL THEN
    SELECT approval_status INTO v_hamid_status FROM public.profiles WHERE id = v_hamid_uid;
    v_hamid_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_hamid_uid AND role = 'admin');
  END IF;

  RETURN jsonb_build_object(
    'dry_run', true,
    'checked_at', now(),
    'preconditions', jsonb_build_object(
      'organizations_count', v_orgs,
      'hamid_user_exists',   v_hamid_uid IS NOT NULL
    ),
    'would_create', jsonb_build_object(
      'permissions', COALESCE(v_missing_perms, ARRAY[]::text[]),
      'permissions_count', COALESCE(array_length(v_missing_perms, 1), 0),
      'roles', COALESCE(v_missing_roles, '[]'::jsonb),
      'roles_count', COALESCE(jsonb_array_length(v_missing_roles), 0)
    ),
    'would_update', jsonb_build_object(
      'hamid_email', 'hamid@hrhbs.com',
      'hamid_current_status', v_hamid_status,
      'hamid_is_admin', v_hamid_admin,
      'hamid_needs_approval', v_hamid_status IS DISTINCT FROM 'approved',
      'hamid_needs_admin_role', v_hamid_admin IS NOT TRUE
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.seed_core_system_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_core_system_plan() TO authenticated, service_role;
