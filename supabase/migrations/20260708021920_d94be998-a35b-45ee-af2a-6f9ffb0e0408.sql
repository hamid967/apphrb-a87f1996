
CREATE OR REPLACE FUNCTION public.provision_developer_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_org uuid;
  v_role uuid;
  v_perms text[] := ARRAY[
    'screen.dashboard.view','screen.reports.view','screen.accounting.view',
    'screen.admin.view','company.view','branch.view','department.view',
    'report.financial.view','report.occupancy.view',
    'export.csv','export.json','export.pdf',
    'import.contacts','import.leads','import.units','api.call'
  ];
  v_assigned int := 0;
  v_created_org boolean := false;
  v_exists boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Grant org 'admin' role FIRST so the approval-restriction trigger allows
  -- the profile update below (has_role check runs as invoker).
  INSERT INTO user_roles(user_id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Auto-approve developer profile and grant a 30-day trial so gates lift.
  UPDATE profiles
     SET approval_status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         trial_ends_at = COALESCE(trial_ends_at, now() + interval '30 days'),
         updated_at = now()
   WHERE id = uid
     AND (approval_status IS DISTINCT FROM 'approved' OR trial_ends_at IS NULL);

  SELECT om.org_id INTO v_org
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
   WHERE om.user_id = uid AND o.name ILIKE 'Developer Sandbox%'
   ORDER BY o.created_at ASC LIMIT 1;

  IF v_org IS NULL THEN
    INSERT INTO organizations(name, slug, created_by)
    VALUES ('Developer Sandbox', 'dev-'||substr(uid::text,1,8), uid)
    RETURNING id INTO v_org;
    v_created_org := true;
  END IF;

  INSERT INTO organization_members(org_id, user_id, role)
  VALUES (v_org, uid, 'admin')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  SELECT id INTO v_role FROM rbac_roles
   WHERE org_id = v_org AND name = 'Developer' LIMIT 1;

  IF v_role IS NULL THEN
    INSERT INTO rbac_roles(org_id, name, slug, description)
    VALUES (v_org, 'Developer', 'developer', 'Developer sandbox role — read + export access')
    RETURNING id INTO v_role;
  END IF;

  INSERT INTO rbac_role_permissions(role_id, permission_id, allow)
  SELECT v_role, p.id, true FROM rbac_permissions p WHERE p.code = ANY(v_perms)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  SELECT EXISTS(
    SELECT 1 FROM rbac_user_roles
     WHERE org_id = v_org AND user_id = uid AND role_id = v_role AND scope_type = 'global'
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO rbac_user_roles(org_id, user_id, role_id, scope_type)
    VALUES (v_org, uid, v_role, 'global');
  END IF;

  SELECT count(*) INTO v_assigned
    FROM rbac_role_permissions WHERE role_id = v_role AND allow;

  RETURN jsonb_build_object(
    'org_id', v_org,
    'role_id', v_role,
    'permissions', v_assigned,
    'created_org', v_created_org
  );
END $function$;
