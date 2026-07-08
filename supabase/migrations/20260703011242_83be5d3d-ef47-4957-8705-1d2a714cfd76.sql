
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

CREATE OR REPLACE FUNCTION public.bulk_apply_role_template(_org uuid, _template_name text, _template_slug text, _description text, _permissions text[], _scope rbac_scope_type, _user_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_uid uuid;
  v_ok int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_err text;
  v_exists boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_org_admin(_org, v_actor) THEN
    RAISE EXCEPTION 'Forbidden: org admin required';
  END IF;

  SELECT id INTO v_role_id
    FROM public.rbac_roles
   WHERE org_id = _org AND name = _template_name
   LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.rbac_roles(org_id, name, slug, description)
    VALUES (_org, _template_name, _template_slug, _description)
    RETURNING id INTO v_role_id;

    INSERT INTO public.rbac_role_permissions(role_id, permission_id, allow)
    SELECT v_role_id, p.id, true
      FROM public.rbac_permissions p
     WHERE p.code = ANY(_permissions)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  FOREACH v_uid IN ARRAY _user_ids LOOP
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM public.rbac_user_roles
         WHERE org_id = _org AND user_id = v_uid AND role_id = v_role_id AND scope_type = _scope
      ) INTO v_exists;

      IF v_exists THEN
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('user_id', v_uid, 'status', 'duplicate');
      ELSE
        INSERT INTO public.rbac_user_roles(org_id, user_id, role_id, scope_type)
        VALUES (_org, v_uid, v_role_id, _scope);
        v_ok := v_ok + 1;
        v_results := v_results || jsonb_build_object('user_id', v_uid, 'status', 'assigned');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_results := v_results || jsonb_build_object('user_id', v_uid, 'status', 'error', 'error', v_err);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'role_id', v_role_id,
    'assigned', v_ok,
    'skipped', v_skipped,
    'total', COALESCE(array_length(_user_ids, 1), 0),
    'results', v_results
  );
END $function$;
