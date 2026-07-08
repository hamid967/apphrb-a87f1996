
-- 1) Extend org_role enum with property_owner
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'property_owner';

-- 2) Link profiles → owners (so a signed-in user can be a property owner)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.owners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_owner_id ON public.profiles(owner_id);

-- 3) Helper: is org management (owner or admin)
CREATE OR REPLACE FUNCTION public.is_org_admin(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org AND user_id = _user AND role IN ('owner','admin')
  );
$$;

-- Helper: is the given owner record linked to the signed-in user
CREATE OR REPLACE FUNCTION public.is_linked_property_owner(_owner_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND owner_id = _owner_id);
$$;

-- 4) OWNERS — sensitive PII. Replace open "ALL org access" with tiered policies.
DROP POLICY IF EXISTS "owners org access" ON public.owners;

CREATE POLICY "owners: admin manage"
  ON public.owners FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE POLICY "owners: staff read"
  ON public.owners FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['agent'::org_role,'viewer'::org_role]));

CREATE POLICY "owners: self read"
  ON public.owners FOR SELECT TO authenticated
  USING (public.is_linked_property_owner(id, auth.uid()));

-- 5) TENANTS — sensitive PII, same pattern
DROP POLICY IF EXISTS "tenants org access" ON public.tenants;

CREATE POLICY "tenants: admin manage"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE POLICY "tenants: staff read"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['agent'::org_role,'viewer'::org_role]));

CREATE POLICY "tenants: linked owner read"
  ON public.tenants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.tenant_id = tenants.id AND c.owner_id = p.owner_id
  ));

-- 6) PAYMENTS — financial data. Admin manage; agent read; property_owner reads only own contracts.
DROP POLICY IF EXISTS "payments org access" ON public.payments;

CREATE POLICY "payments: admin manage"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE POLICY "payments: staff read"
  ON public.payments FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['agent'::org_role,'viewer'::org_role]));

CREATE POLICY "payments: linked owner read"
  ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = payments.contract_id AND c.owner_id = p.owner_id
  ));

-- 7) CONTRACTS — keep readable by all members; writes restricted to management/agent
DROP POLICY IF EXISTS "contracts org access" ON public.contracts;

CREATE POLICY "contracts: members read"
  ON public.contracts FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "contracts: staff write"
  ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'agent'::org_role]));

CREATE POLICY "contracts: staff update"
  ON public.contracts FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'agent'::org_role]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'agent'::org_role]));

CREATE POLICY "contracts: admin delete"
  ON public.contracts FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

CREATE POLICY "contracts: linked owner read"
  ON public.contracts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.owner_id = contracts.owner_id
  ));
