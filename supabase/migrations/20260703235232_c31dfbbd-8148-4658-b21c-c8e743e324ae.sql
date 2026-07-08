
CREATE OR REPLACE FUNCTION public.seed_core_system()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  org record;
  role_owner uuid;
  role_manager uuid;
  role_viewer uuid;
  owner_perms   text[];
  manager_perms text[] := ARRAY[
    'screen.dashboard.view','screen.reports.view','screen.accounting.view',
    'company.view','branch.view','branch.manage','department.view','department.manage',
    'report.financial.view','report.occupancy.view',
    'export.csv','export.json','export.pdf',
    'import.contacts','import.leads','import.units',
    'button.contract.approve','button.expense.approve',
    'api.call'
  ];
  viewer_perms text[] := ARRAY[
    'screen.dashboard.view','screen.reports.view',
    'company.view','branch.view','department.view',
    'report.financial.view','report.occupancy.view',
    'export.csv','export.json'
  ];
  v_orgs int := 0;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- 1) Permission catalog
  INSERT INTO public.rbac_permissions (code, level, resource, action, description, is_system) VALUES
    ('screen.dashboard.view','screen','dashboard','view','View dashboard screen',true),
    ('screen.reports.view','screen','reports','view','View reports screen',true),
    ('screen.accounting.view','screen','accounting','view','View accounting screen',true),
    ('screen.admin.view','screen','admin','view','View admin screen',true),
    ('company.view','company','company','view','View company details',true),
    ('company.manage','company','company','manage','Manage company settings',true),
    ('branch.view','branch','branch','view','View branches',true),
    ('branch.manage','branch','branch','manage','Manage branches',true),
    ('department.view','department','department','view','View departments',true),
    ('department.manage','department','department','manage','Manage departments',true),
    ('report.financial.view','report','financial','view','View financial reports',true),
    ('report.occupancy.view','report','occupancy','view','View occupancy reports',true),
    ('export.csv','export','export','csv','Export as CSV',true),
    ('export.json','export','export','json','Export as JSON',true),
    ('export.pdf','export','export','pdf','Export as PDF',true),
    ('import.contacts','import','contacts','import','Import contacts',true),
    ('import.leads','import','leads','import','Import leads',true),
    ('import.units','import','units','import','Import units',true),
    ('api.call','api','api','call','Invoke API endpoints',true),
    ('api.keys.manage','api','keys','manage','Manage API keys',true),
    ('button.contract.approve','button','contract','approve','Approve contracts',true),
    ('button.expense.approve','button','expense','approve','Approve expenses',true),
    ('button.payment.refund','button','payment','refund','Refund payments',true),
    ('field.contract.amount.view','field','contract.amount','view','View contract amount field',true),
    ('field.owner.bank.view','field','owner.bank','view','View owner bank field',true),
    ('field.tenant.national_id.view','field','tenant.national_id','view','View tenant national id field',true)
  ON CONFLICT (code) DO NOTHING;

  owner_perms := ARRAY(SELECT code FROM public.rbac_permissions);

  -- 2) Per-org system roles + grants
  FOR org IN SELECT id FROM public.organizations LOOP
    v_orgs := v_orgs + 1;

    INSERT INTO public.rbac_roles(org_id, name, slug, description, is_system)
    VALUES (org.id,'Owner','core.owner','Full access to all system features',true)
    ON CONFLICT (org_id, slug) DO UPDATE SET is_system=true, active=true
    RETURNING id INTO role_owner;

    INSERT INTO public.rbac_roles(org_id, name, slug, description, is_system)
    VALUES (org.id,'Manager','core.manager','Operations + reporting, no admin/API management',true)
    ON CONFLICT (org_id, slug) DO UPDATE SET is_system=true, active=true
    RETURNING id INTO role_manager;

    INSERT INTO public.rbac_roles(org_id, name, slug, description, is_system)
    VALUES (org.id,'Viewer','core.viewer','Read-only access to dashboards and reports',true)
    ON CONFLICT (org_id, slug) DO UPDATE SET is_system=true, active=true
    RETURNING id INTO role_viewer;

    INSERT INTO public.rbac_role_permissions(role_id, permission_id, allow)
    SELECT role_owner, p.id, true FROM public.rbac_permissions p WHERE p.code = ANY(owner_perms)
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO public.rbac_role_permissions(role_id, permission_id, allow)
    SELECT role_manager, p.id, true FROM public.rbac_permissions p WHERE p.code = ANY(manager_perms)
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO public.rbac_role_permissions(role_id, permission_id, allow)
    SELECT role_viewer, p.id, true FROM public.rbac_permissions p WHERE p.code = ANY(viewer_perms)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- 3) Site owner bootstrap
  PERFORM public.approve_site_owner('hamid@hrhbs.com', 30);

  RETURN jsonb_build_object(
    'permissions', (SELECT count(*) FROM public.rbac_permissions),
    'organizations', v_orgs,
    'core_roles',   (SELECT count(*) FROM public.rbac_roles WHERE slug LIKE 'core.%'),
    'grants',       (SELECT count(*) FROM public.rbac_role_permissions rp
                       JOIN public.rbac_roles r ON r.id = rp.role_id
                      WHERE r.slug LIKE 'core.%')
  );
END $$;

REVOKE ALL ON FUNCTION public.seed_core_system() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_core_system() TO authenticated, service_role;

SELECT public.seed_core_system();
