-- ============================================================
-- Professional RBAC: permissions, roles, role_permissions, user role assignments (scoped)
-- Scopes: global | company | branch | department
-- Levels: company/branch/department/screen/button/field/report/export/import/api
-- ============================================================

-- 1) Permission level enum
DO $$ BEGIN
  CREATE TYPE public.permission_level AS ENUM (
    'company','branch','department','screen','button','field','report','export','import','api'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rbac_scope_type AS ENUM ('global','company','branch','department');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Departments (branch-scoped)
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departments org members read" ON public.departments;
CREATE POLICY "departments org members read" ON public.departments
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
DROP POLICY IF EXISTS "departments org admin write" ON public.departments;
CREATE POLICY "departments org admin write" ON public.departments
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
DROP TRIGGER IF EXISTS trg_departments_updated ON public.departments;
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Global permission catalog (system-defined, per level)
CREATE TABLE IF NOT EXISTS public.rbac_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,             -- e.g. 'reports.export.financials'
  level public.permission_level NOT NULL,
  resource text NOT NULL,                -- e.g. 'reports', 'contracts', 'unit_form.rent_amount'
  action text NOT NULL,                  -- 'view','create','update','delete','export','import','call'
  description text,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rbac_permissions TO authenticated;
GRANT ALL ON public.rbac_permissions TO service_role;
ALTER TABLE public.rbac_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rbac_permissions read all authenticated" ON public.rbac_permissions;
CREATE POLICY "rbac_permissions read all authenticated" ON public.rbac_permissions
  FOR SELECT TO authenticated USING (true);

-- 4) Per-org roles (custom + system) built by Role Builder
CREATE TABLE IF NOT EXISTS public.rbac_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_roles TO authenticated;
GRANT ALL ON public.rbac_roles TO service_role;
ALTER TABLE public.rbac_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rbac_roles read org members" ON public.rbac_roles;
CREATE POLICY "rbac_roles read org members" ON public.rbac_roles
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
DROP POLICY IF EXISTS "rbac_roles admin write" ON public.rbac_roles;
CREATE POLICY "rbac_roles admin write" ON public.rbac_roles
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));
DROP TRIGGER IF EXISTS trg_rbac_roles_updated ON public.rbac_roles;
CREATE TRIGGER trg_rbac_roles_updated BEFORE UPDATE ON public.rbac_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Role ↔ Permission mapping
CREATE TABLE IF NOT EXISTS public.rbac_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.rbac_permissions(id) ON DELETE CASCADE,
  allow boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_role_permissions TO authenticated;
GRANT ALL ON public.rbac_role_permissions TO service_role;
ALTER TABLE public.rbac_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rbac_rp read via role org" ON public.rbac_role_permissions;
CREATE POLICY "rbac_rp read via role org" ON public.rbac_role_permissions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.rbac_roles r WHERE r.id = role_id AND public.is_org_member(r.org_id, auth.uid()))
  );
DROP POLICY IF EXISTS "rbac_rp write via role org admin" ON public.rbac_role_permissions;
CREATE POLICY "rbac_rp write via role org admin" ON public.rbac_role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rbac_roles r WHERE r.id = role_id AND public.is_org_admin(r.org_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rbac_roles r WHERE r.id = role_id AND public.is_org_admin(r.org_id, auth.uid())));

-- 6) User role assignments with scope (company/branch/department/global)
CREATE TABLE IF NOT EXISTS public.rbac_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  scope_type public.rbac_scope_type NOT NULL DEFAULT 'global',
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, role_id, scope_type, company_id, branch_id, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_user_roles TO authenticated;
GRANT ALL ON public.rbac_user_roles TO service_role;
ALTER TABLE public.rbac_user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rbac_ur read self or org admin" ON public.rbac_user_roles;
CREATE POLICY "rbac_ur read self or org admin" ON public.rbac_user_roles
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_org_admin(org_id, auth.uid())
  );
DROP POLICY IF EXISTS "rbac_ur write org admin" ON public.rbac_user_roles;
CREATE POLICY "rbac_ur write org admin" ON public.rbac_user_roles
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

-- 7) has_permission() — evaluates scoped permission for current user
CREATE OR REPLACE FUNCTION public.has_permission(
  _org uuid,
  _permission_code text,
  _company uuid DEFAULT NULL,
  _branch uuid DEFAULT NULL,
  _department uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.rbac_user_roles ur
      JOIN public.rbac_role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.rbac_permissions p       ON p.id = rp.permission_id
     WHERE ur.user_id = auth.uid()
       AND ur.org_id  = _org
       AND rp.allow
       AND p.code = _permission_code
       AND (
         ur.scope_type = 'global'
         OR (ur.scope_type = 'company'    AND (_company    IS NULL OR ur.company_id    = _company))
         OR (ur.scope_type = 'branch'     AND (_branch     IS NULL OR ur.branch_id     = _branch))
         OR (ur.scope_type = 'department' AND (_department IS NULL OR ur.department_id = _department))
       )
  )
  OR public.is_org_admin(_org, auth.uid());
$$;

-- 8) Seed baseline permission catalog (idempotent)
INSERT INTO public.rbac_permissions (code, level, resource, action, description) VALUES
  ('company.view','company','company','view','View company records'),
  ('company.manage','company','company','update','Manage company records'),
  ('branch.view','branch','branch','view','View branches'),
  ('branch.manage','branch','branch','update','Manage branches'),
  ('department.view','department','department','view','View departments'),
  ('department.manage','department','department','update','Manage departments'),
  ('screen.dashboard.view','screen','screen.dashboard','view','See main dashboard'),
  ('screen.accounting.view','screen','screen.accounting','view','See accounting section'),
  ('screen.reports.view','screen','screen.reports','view','See reports section'),
  ('screen.admin.view','screen','screen.admin','view','See admin panel'),
  ('button.contract.approve','button','button.contract.approve','call','Approve contracts'),
  ('button.payment.refund','button','button.payment.refund','call','Refund a payment'),
  ('button.expense.approve','button','button.expense.approve','call','Approve expense claims'),
  ('field.tenant.national_id.view','field','field.tenant.national_id','view','View tenant national id'),
  ('field.contract.amount.view','field','field.contract.amount','view','View contract amount'),
  ('field.owner.bank.view','field','field.owner.bank','view','View owner bank details'),
  ('report.financial.view','report','report.financial','view','View financial reports'),
  ('report.occupancy.view','report','report.occupancy','view','View occupancy reports'),
  ('export.csv','export','export','call','Export data as CSV'),
  ('export.pdf','export','export','call','Export data as PDF'),
  ('export.json','export','export','call','Export data as JSON'),
  ('import.contacts','import','import.contacts','call','Import contacts'),
  ('import.leads','import','import.leads','call','Import leads'),
  ('import.units','import','import.units','call','Import units'),
  ('api.keys.manage','api','api.keys','update','Manage API keys'),
  ('api.call','api','api','call','Call authenticated API endpoints')
ON CONFLICT (code) DO NOTHING;

-- 9) Helper RPC: list scoped permission codes for current user (for UI hydration)
CREATE OR REPLACE FUNCTION public.my_permissions(_org uuid)
RETURNS TABLE(code text, scope_type public.rbac_scope_type, company_id uuid, branch_id uuid, department_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.code, ur.scope_type, ur.company_id, ur.branch_id, ur.department_id
    FROM public.rbac_user_roles ur
    JOIN public.rbac_role_permissions rp ON rp.role_id = ur.role_id AND rp.allow
    JOIN public.rbac_permissions p       ON p.id = rp.permission_id
   WHERE ur.user_id = auth.uid() AND ur.org_id = _org;
$$;
