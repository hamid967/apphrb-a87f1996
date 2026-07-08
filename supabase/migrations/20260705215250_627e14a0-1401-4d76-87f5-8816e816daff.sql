-- 1) Allow SECURITY DEFINER seed functions (running as postgres) to link
--    profiles → owner_id/tenant_id. End-user flows are still blocked because
--    they run as authenticated/anon; current_user is only 'postgres' inside
--    an internal SECURITY DEFINER helper owned by postgres.
CREATE OR REPLACE FUNCTION public.tg_profiles_block_link_selfassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.owner_id IS DISTINCT FROM OLD.owner_id)
     OR (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    -- Internal seed / maintenance calls: current_user is the definer role.
    IF current_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RAISE EXCEPTION 'Only super_admin can change linked owner_id/tenant_id on profiles';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

-- 2) Idempotent portal e2e seed. Given two pre-created auth.users ids
--    (tenant + owner), builds/refreshes the minimum graph needed for the
--    tenant portal, owner portal, and owner statement pages.
CREATE OR REPLACE FUNCTION public.seed_portal_test_users(
  _tenant_uid uuid,
  _owner_uid  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        uuid;
  v_tenant     uuid;
  v_owner      uuid;
  v_unit       uuid;
  v_building   uuid;
  v_contract   uuid;
  v_charge     uuid;
  v_statement  uuid;
BEGIN
  IF _tenant_uid IS NULL OR _owner_uid IS NULL THEN
    RAISE EXCEPTION 'tenant_uid and owner_uid required';
  END IF;

  -- Org (idempotent by name + created_by = tenant)
  SELECT id INTO v_org FROM public.organizations
   WHERE name = 'HBS E2E Test Org' LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO public.organizations(name, slug, created_by)
    VALUES ('HBS E2E Test Org',
            'hbs-e2e-'||substr(_tenant_uid::text, 1, 8),
            _tenant_uid)
    RETURNING id INTO v_org;
  END IF;

  -- Ensure both auth users have profile rows + are approved so the
  -- managed layout doesn't gate them at the AccessGate.
  INSERT INTO public.profiles(id, full_name, approval_status, approved_at, trial_ends_at)
  VALUES (_tenant_uid, 'E2E Tenant', 'approved', now(), now() + interval '365 days')
  ON CONFLICT (id) DO UPDATE
    SET approval_status = 'approved',
        approved_at = COALESCE(public.profiles.approved_at, now()),
        trial_ends_at = GREATEST(public.profiles.trial_ends_at, now() + interval '365 days');

  INSERT INTO public.profiles(id, full_name, approval_status, approved_at, trial_ends_at)
  VALUES (_owner_uid, 'E2E Owner', 'approved', now(), now() + interval '365 days')
  ON CONFLICT (id) DO UPDATE
    SET approval_status = 'approved',
        approved_at = COALESCE(public.profiles.approved_at, now()),
        trial_ends_at = GREATEST(public.profiles.trial_ends_at, now() + interval '365 days');

  -- Tenant domain row (idempotent by org + email)
  SELECT id INTO v_tenant FROM public.tenants
   WHERE org_id = v_org AND email = 'tenant.e2e@hbspro.test' LIMIT 1;
  IF v_tenant IS NULL THEN
    INSERT INTO public.tenants(org_id, full_name, email, phone, nationality)
    VALUES (v_org, 'E2E Tenant', 'tenant.e2e@hbspro.test', '+966500000901', 'SA')
    RETURNING id INTO v_tenant;
  END IF;

  -- Owner domain row (idempotent)
  SELECT id INTO v_owner FROM public.owners
   WHERE org_id = v_org AND email = 'owner.e2e@hbspro.test' LIMIT 1;
  IF v_owner IS NULL THEN
    INSERT INTO public.owners(org_id, full_name, email, phone, address)
    VALUES (v_org, 'E2E Owner', 'owner.e2e@hbspro.test', '+966500000902', 'Riyadh')
    RETURNING id INTO v_owner;
  END IF;

  -- Link the profiles (trigger now allows this since we're running as postgres).
  UPDATE public.profiles SET tenant_id = v_tenant WHERE id = _tenant_uid;
  UPDATE public.profiles SET owner_id  = v_owner  WHERE id = _owner_uid;

  -- Building + unit for the contract (idempotent).
  SELECT id INTO v_building FROM public.buildings
   WHERE org_id = v_org AND code = 'E2E-BLD' LIMIT 1;
  IF v_building IS NULL THEN
    INSERT INTO public.buildings(org_id, name, code, floors_count, units_count, address)
    VALUES (v_org, 'E2E Building', 'E2E-BLD', 1, 1, 'Test Address')
    RETURNING id INTO v_building;
  END IF;

  SELECT id INTO v_unit FROM public.units
   WHERE org_id = v_org AND code = 'E2E-U-001' LIMIT 1;
  IF v_unit IS NULL THEN
    INSERT INTO public.units(org_id, building_id, code, type, status,
                             area, bedrooms, bathrooms, rent_amount, currency_code)
    VALUES (v_org, v_building, 'E2E-U-001', 'residential', 'occupied',
            80, 2, 1, 3500, 'SAR')
    RETURNING id INTO v_unit;
  END IF;

  -- Contract (idempotent by contract_number).
  SELECT id INTO v_contract FROM public.contracts
   WHERE org_id = v_org AND contract_number = 'E2E-CN-0001' LIMIT 1;
  IF v_contract IS NULL THEN
    INSERT INTO public.contracts(
      org_id, contract_number, unit_id, tenant_id, owner_id,
      type, status, start_date, end_date, amount, currency_code,
      payment_frequency, deposit, created_by
    )
    VALUES (
      v_org, 'E2E-CN-0001', v_unit, v_tenant, v_owner,
      'rent', 'active',
      (now() - interval '2 month')::date,
      (now() + interval '10 month')::date,
      42000, 'SAR', 'monthly', 3500, _tenant_uid
    )
    RETURNING id INTO v_contract;
  END IF;

  -- Rent charge (pending — visible on tenant portal).
  SELECT id INTO v_charge FROM public.rent_charges
   WHERE contract_id = v_contract
     AND period_start = date_trunc('month', now())::date
   LIMIT 1;
  IF v_charge IS NULL THEN
    INSERT INTO public.rent_charges(
      org_id, contract_id, tenant_id,
      period_start, period_end, due_date,
      amount, currency, status
    )
    VALUES (
      v_org, v_contract, v_tenant,
      date_trunc('month', now())::date,
      (date_trunc('month', now()) + interval '1 month - 1 day')::date,
      (date_trunc('month', now()) + interval '10 days')::date,
      3500, 'SAR', 'pending'
    )
    RETURNING id INTO v_charge;
  END IF;

  -- Owner statement for last month (for /owner/portal/statements/$id).
  SELECT id INTO v_statement FROM public.owner_statements
   WHERE owner_id = v_owner
     AND period_start = (date_trunc('month', now()) - interval '1 month')::date
   LIMIT 1;
  IF v_statement IS NULL THEN
    v_statement := public.generate_owner_statement(
      v_owner,
      (date_trunc('month', now()) - interval '1 month')::date,
      0.08
    );
  END IF;

  RETURN jsonb_build_object(
    'org_id',       v_org,
    'tenant_row',   v_tenant,
    'owner_row',    v_owner,
    'unit_id',      v_unit,
    'contract_id',  v_contract,
    'charge_id',    v_charge,
    'statement_id', v_statement
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_portal_test_users(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_portal_test_users(uuid, uuid) TO service_role;
