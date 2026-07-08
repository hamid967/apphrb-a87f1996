
-- =====================================================================
-- 1. DROP LEGACY EXPENSE-APP OBJECTS
-- =====================================================================
DROP TABLE IF EXISTS public.policy_violations CASCADE;
DROP TABLE IF EXISTS public.expense_comments CASCADE;
DROP TABLE IF EXISTS public.receipt_jobs CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.expense_reports CASCADE;
DROP TABLE IF EXISTS public.saved_reports CASCADE;
DROP TABLE IF EXISTS public.policies CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;

DROP FUNCTION IF EXISTS public.apply_policy_violations(uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.guard_expense_status_change() CASCADE;
DROP FUNCTION IF EXISTS public.guard_report_status_change() CASCADE;
DROP FUNCTION IF EXISTS public.guard_receipt_jobs_owner_update() CASCADE;
DROP FUNCTION IF EXISTS public.record_audit(text, uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.manages(uuid) CASCADE;

DROP TYPE IF EXISTS public.expense_status CASCADE;
DROP TYPE IF EXISTS public.report_status CASCADE;

-- =====================================================================
-- 2. ORG ROLE ENUM
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('owner','admin','agent','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_type AS ENUM ('apartment','villa','office','land','shop','warehouse','building','farm','chalet','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_type AS ENUM ('sale','rent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_status AS ENUM ('available','reserved','sold','rented','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 3. ORGANIZATIONS
-- =====================================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 4. ORGANIZATION MEMBERS
-- =====================================================================
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX ON public.organization_members (user_id);
CREATE INDEX ON public.organization_members (org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 5. HELPER FUNCTIONS (SECURITY DEFINER, to avoid RLS recursion)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = _org AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org AND user_id = _user AND role = ANY(_roles)
  );
$$;

-- Auto-add creator as owner
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 6. RLS: organizations
-- =====================================================================
CREATE POLICY "members can view their orgs"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));

CREATE POLICY "authenticated can create orgs"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owners/admins can update org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "owners can delete org"
  ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(id, auth.uid(), ARRAY['owner']::public.org_role[]));

-- =====================================================================
-- 7. RLS: organization_members
-- =====================================================================
CREATE POLICY "members can view org members"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

-- Allow initial owner insert (via trigger, runs as definer) AND owner/admin invites
CREATE POLICY "owners/admins can add members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "owners/admins can update members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "owners/admins can remove members or self-leave"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
    OR user_id = auth.uid()
  );

-- =====================================================================
-- 8. PROPERTIES
-- =====================================================================
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  description_ar text,
  description_en text,
  property_type public.property_type NOT NULL DEFAULT 'apartment',
  listing_type public.listing_type NOT NULL DEFAULT 'sale',
  status public.listing_status NOT NULL DEFAULT 'available',
  price numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  area_sqm numeric(10,2),
  bedrooms int,
  bathrooms int,
  city text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  cover_image_url text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.properties (org_id);
CREATE INDEX ON public.properties (status);
CREATE INDEX ON public.properties (listing_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_properties_updated_at ON public.properties;
CREATE TRIGGER set_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "org members can view properties"
  ON public.properties FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "editors can insert properties"
  ON public.properties FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[])
  );

CREATE POLICY "editors can update properties"
  ON public.properties FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[]));

CREATE POLICY "editors can delete properties"
  ON public.properties FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[]));

-- =====================================================================
-- 9. PROPERTY IMAGES
-- =====================================================================
CREATE TABLE public.property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.property_images (property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_images TO authenticated;
GRANT ALL ON public.property_images TO service_role;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view property images"
  ON public.property_images FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND public.is_org_member(p.org_id, auth.uid())
  ));

CREATE POLICY "editors can manage property images"
  ON public.property_images FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id
      AND public.has_org_role(p.org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id
      AND public.has_org_role(p.org_id, auth.uid(), ARRAY['owner','admin','agent']::public.org_role[])
  ));
