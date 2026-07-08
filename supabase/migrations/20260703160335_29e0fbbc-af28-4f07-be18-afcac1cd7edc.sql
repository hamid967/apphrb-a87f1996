
-- 1) Companion admin-only tables for sensitive PII
CREATE TABLE public.owners_sensitive (
  owner_id uuid PRIMARY KEY REFERENCES public.owners(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  iban text,
  national_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owners_sensitive TO authenticated;
GRANT ALL ON public.owners_sensitive TO service_role;
ALTER TABLE public.owners_sensitive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_sensitive: org admin only"
  ON public.owners_sensitive FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE TABLE public.tenants_sensitive (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  national_id text,
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants_sensitive TO authenticated;
GRANT ALL ON public.tenants_sensitive TO service_role;
ALTER TABLE public.tenants_sensitive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_sensitive: org admin only"
  ON public.tenants_sensitive FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE TRIGGER trg_owners_sensitive_updated_at
  BEFORE UPDATE ON public.owners_sensitive
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tenants_sensitive_updated_at
  BEFORE UPDATE ON public.tenants_sensitive
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Migrate existing data
INSERT INTO public.owners_sensitive (owner_id, org_id, iban, national_id)
SELECT id, org_id, iban, national_id
  FROM public.owners
 WHERE iban IS NOT NULL OR national_id IS NOT NULL
ON CONFLICT (owner_id) DO NOTHING;

INSERT INTO public.tenants_sensitive (tenant_id, org_id, national_id, date_of_birth)
SELECT id, org_id, national_id, date_of_birth
  FROM public.tenants
 WHERE national_id IS NOT NULL OR date_of_birth IS NOT NULL
ON CONFLICT (tenant_id) DO NOTHING;

-- 3) Drop sensitive columns from base tables
ALTER TABLE public.owners DROP COLUMN IF EXISTS iban;
ALTER TABLE public.owners DROP COLUMN IF EXISTS national_id;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS national_id;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS date_of_birth;

-- 4) Update seed_demo_data to keep working after the column drops
CREATE OR REPLACE FUNCTION public.seed_demo_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  org uuid;
  sa uuid; ae uuid;
  riyadh uuid; jeddah uuid; dubai uuid;
  comp uuid; br1 uuid; br2 uuid;
  bld1 uuid; bld2 uuid;
  fl1 uuid; fl2 uuid; fl3 uuid;
  u_id uuid; unit_ids uuid[] := ARRAY[]::uuid[];
  own1 uuid; own2 uuid;
  ten uuid; ten_ids uuid[] := ARRAY[]::uuid[];
  c_id uuid;
  i int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  INSERT INTO countries(code,name,name_ar,phone_code) VALUES
    ('SA','Saudi Arabia','السعودية','+966'),
    ('AE','United Arab Emirates','الإمارات','+971'),
    ('EG','Egypt','مصر','+20')
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO currencies(code,name,symbol,decimals) VALUES
    ('SAR','Saudi Riyal','﷼',2),
    ('AED','UAE Dirham','د.إ',2),
    ('USD','US Dollar','$',2)
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO sa FROM countries WHERE code='SA';
  SELECT id INTO ae FROM countries WHERE code='AE';

  INSERT INTO cities(country_id,name,name_ar) VALUES
    (sa,'Riyadh','الرياض'),(sa,'Jeddah','جدة'),(ae,'Dubai','دبي')
  ON CONFLICT DO NOTHING;
  SELECT id INTO riyadh FROM cities WHERE name='Riyadh' LIMIT 1;
  SELECT id INTO jeddah FROM cities WHERE name='Jeddah' LIMIT 1;
  SELECT id INTO dubai  FROM cities WHERE name='Dubai'  LIMIT 1;

  INSERT INTO organizations(name, slug, created_by)
    VALUES ('AQARY Demo', 'aqary-demo-'||substr(uid::text,1,8), uid)
    RETURNING id INTO org;

  INSERT INTO companies(org_id,name,legal_name,tax_id,country_id,city_id,address,phone,email,created_by)
    VALUES (org,'AQARY Holding','AQARY Holding LLC','300000000000003',sa,riyadh,'King Fahd Rd','+966500000000','info@aqary.demo',uid)
    RETURNING id INTO comp;

  INSERT INTO branches(org_id,company_id,name,code,city_id,address,phone)
    VALUES (org,comp,'Riyadh HQ','RUH-01',riyadh,'Olaya St','+966111111111') RETURNING id INTO br1;
  INSERT INTO branches(org_id,company_id,name,code,city_id,address,phone)
    VALUES (org,comp,'Jeddah Branch','JED-01',jeddah,'Tahlia St','+966122222222') RETURNING id INTO br2;

  INSERT INTO buildings(org_id,branch_id,name,code,floors_count,units_count,built_year,address)
    VALUES (org,br1,'Al Noor Tower','B-NOOR',10,20,2018,'Riyadh, Olaya') RETURNING id INTO bld1;
  INSERT INTO buildings(org_id,branch_id,name,code,floors_count,units_count,built_year,address)
    VALUES (org,br2,'Rawdah Plaza','B-RWD',5,10,2020,'Jeddah, Rawdah') RETURNING id INTO bld2;

  INSERT INTO floors(org_id,building_id,number,name,units_count)
    VALUES (org,bld1,1,'Ground',4) RETURNING id INTO fl1;
  INSERT INTO floors(org_id,building_id,number,name,units_count)
    VALUES (org,bld1,2,'First',4) RETURNING id INTO fl2;
  INSERT INTO floors(org_id,building_id,number,name,units_count)
    VALUES (org,bld2,1,'Ground',3) RETURNING id INTO fl3;

  FOR i IN 1..8 LOOP
    INSERT INTO units(org_id,building_id,floor_id,code,type,status,area,bedrooms,bathrooms,rent_amount,currency_code)
    VALUES (
      org,
      CASE WHEN i<=6 THEN bld1 ELSE bld2 END,
      CASE WHEN i<=3 THEN fl1 WHEN i<=6 THEN fl2 ELSE fl3 END,
      'U-'||lpad(i::text,3,'0'),
      CASE WHEN i%3=0 THEN 'commercial' ELSE 'residential' END,
      CASE WHEN i<=5 THEN 'occupied' ELSE 'vacant' END,
      80 + i*10, 1 + (i%3), 1 + (i%2),
      3000 + i*500, 'SAR'
    ) RETURNING id INTO u_id;
    unit_ids := unit_ids || u_id;
  END LOOP;

  INSERT INTO owners(org_id,full_name,email,phone,address)
    VALUES (org,'Khalid Al-Otaibi','khalid@demo.sa','+966501111111','Riyadh') RETURNING id INTO own1;
  INSERT INTO owners_sensitive(owner_id, org_id, national_id) VALUES (own1, org, '1000000001');

  INSERT INTO owners(org_id,full_name,email,phone,address)
    VALUES (org,'Sara Al-Mansouri','sara@demo.ae','+971501111111','Dubai') RETURNING id INTO own2;
  INSERT INTO owners_sensitive(owner_id, org_id, national_id) VALUES (own2, org, '1000000002');

  FOR i IN 1..5 LOOP
    INSERT INTO tenants(org_id,full_name,email,phone,nationality)
    VALUES (org,'Tenant '||i,'tenant'||i||'@demo.sa','+96650000000'||i,'SA')
    RETURNING id INTO ten;
    INSERT INTO tenants_sensitive(tenant_id, org_id, national_id)
      VALUES (ten, org, '2000000'||lpad(i::text,3,'0'));
    ten_ids := ten_ids || ten;
  END LOOP;

  FOR i IN 1..5 LOOP
    INSERT INTO contracts(org_id,contract_number,unit_id,tenant_id,owner_id,type,status,start_date,end_date,amount,currency_code,payment_frequency,deposit,created_by)
    VALUES (
      org, 'CN-'||to_char(now(),'YYYY')||'-'||lpad(i::text,4,'0'),
      unit_ids[i], ten_ids[i],
      CASE WHEN i%2=0 THEN own1 ELSE own2 END,
      'rent','active',
      (now() - (i||' month')::interval)::date,
      (now() + ((12-i)||' month')::interval)::date,
      (3000 + i*500)*12, 'SAR','monthly', (3000+i*500), uid
    ) RETURNING id INTO c_id;

    INSERT INTO invoices(org_id,number,property_id,issue_date,due_date,paid_at,description,subtotal,vat_rate,vat_amount,total,currency,status,created_by)
    SELECT org,
      'INV-'||to_char(now(),'YYYY')||'-'||lpad((i*10+m)::text,5,'0'),
      NULL,
      (now() - ((3-m)||' month')::interval)::date,
      (now() - ((3-m)||' month')::interval + interval '15 day')::date,
      CASE WHEN m<3 THEN (now() - ((3-m)||' month')::interval + interval '10 day') ELSE NULL END,
      'Monthly rent for unit '||unit_ids[i],
      (3000 + i*500), 15, (3000 + i*500)*0.15, (3000+i*500)*1.15, 'SAR',
      CASE WHEN m<3 THEN 'paid' ELSE 'sent' END, uid
    FROM generate_series(1,3) m;
  END LOOP;

  FOR i IN 1..12 LOOP
    INSERT INTO expenses(org_id,spent_at,category,vendor,description,amount,vat_amount,currency,created_by)
    VALUES (
      org,
      (now() - ((i%6)||' month')::interval)::date,
      (ARRAY['maintenance','utilities','marketing','salaries','supplies'])[1 + (i%5)],
      (ARRAY['ACME Ltd','PowerCo','AdWorks','HRPay','OfficeMart'])[1 + (i%5)],
      'Operating expense #'||i,
      500 + i*120, (500+i*120)*0.15, 'SAR', uid
    );
  END LOOP;

  RETURN jsonb_build_object(
    'org_id', org, 'company_id', comp,
    'units', array_length(unit_ids,1),
    'contracts', 5, 'invoices', 15, 'expenses', 12
  );
END $function$;

-- 5) Trigger blocking finance role from modifying profile approval fields
CREATE OR REPLACE FUNCTION public.tg_profiles_restrict_approval_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND (
        NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_at     IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by     IS DISTINCT FROM OLD.approved_by
     OR NEW.trial_ends_at   IS DISTINCT FROM OLD.trial_ends_at
     ) THEN
    RAISE EXCEPTION 'Only admins can modify profile approval fields';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_restrict_approval_fields ON public.profiles;
CREATE TRIGGER trg_profiles_restrict_approval_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_restrict_approval_fields();

-- 6) Revoke EXECUTE from PUBLIC/anon/authenticated on trigger and boot functions
--    (trigger functions never need caller EXECUTE; boot/admin functions
--    already check permissions internally but should not appear in the
--    exposed API surface for anon/authenticated to call directly).
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.tg_audit_row()',
    'public.tg_check_spending_policy()',
    'public.tg_profiles_block_link_selfassign()',
    'public.tg_profiles_block_link_selfinsert()',
    'public.tg_profiles_restrict_approval_fields()',
    'public.tg_validate_autopay_day()',
    'public.handle_new_user()',
    'public.handle_new_organization()',
    'public.grant_hamid_new_org()',
    'public.grant_site_owner_hamid()',
    'public.set_updated_at()',
    'public.soft_delete(regclass, uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
  END LOOP;
END $$;
