
-- 1) Helper: is the current user the linked property owner of this contract?
CREATE OR REPLACE FUNCTION public.is_owner_of_contract(_contract_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.contracts c
      JOIN public.profiles p ON p.id = _user
     WHERE c.id = _contract_id
       AND p.owner_id IS NOT NULL
       AND c.owner_id = p.owner_id
  );
$$;

-- 2) contracts: drop broken linked-owner policy and recreate without is_org_member
DROP POLICY IF EXISTS "contracts: linked owner read" ON public.contracts;
CREATE POLICY "contracts: linked owner read"
ON public.contracts
FOR SELECT
TO authenticated
USING (
  public.is_linked_property_owner(owner_id, auth.uid())
);

-- 3) payments: same fix — check ownership through the parent contract only
DROP POLICY IF EXISTS "payments: linked owner read" ON public.payments;
CREATE POLICY "payments: linked owner read"
ON public.payments
FOR SELECT
TO authenticated
USING (
  public.is_owner_of_contract(contract_id, auth.uid())
);

-- 4) tenants: linked owner can read tenants that appear on any of their contracts
DROP POLICY IF EXISTS "tenants: linked owner read" ON public.tenants;
CREATE POLICY "tenants: linked owner read"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.contracts c
      JOIN public.profiles p ON p.id = auth.uid()
     WHERE c.tenant_id = tenants.id
       AND p.owner_id IS NOT NULL
       AND c.owner_id = p.owner_id
  )
);

-- 5) rent_charges: linked owner can read charges of their contracts
DROP POLICY IF EXISTS "rc_linked_owner_read" ON public.rent_charges;
CREATE POLICY "rc_linked_owner_read"
ON public.rent_charges
FOR SELECT
TO authenticated
USING (
  public.is_owner_of_contract(contract_id, auth.uid())
);

-- 6) units: linked owner can read units currently tied to their contracts
DROP POLICY IF EXISTS "units: linked owner read" ON public.units;
CREATE POLICY "units: linked owner read"
ON public.units
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.contracts c
      JOIN public.profiles p ON p.id = auth.uid()
     WHERE c.unit_id = units.id
       AND p.owner_id IS NOT NULL
       AND c.owner_id = p.owner_id
  )
);
