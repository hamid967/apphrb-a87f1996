
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Reference data (idempotent)
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

  -- Organization
  INSERT INTO organizations(name, slug, created_by)
    VALUES ('AQARY Demo', 'aqary-demo-'||substr(uid::text,1,8), uid)
    RETURNING id INTO org;

  -- Company + branches
  INSERT INTO companies(org_id,name,legal_name,tax_id,country_id,city_id,address,phone,email,created_by)
    VALUES (org,'AQARY Holding','AQARY Holding LLC','300000000000003',sa,riyadh,'King Fahd Rd','+966500000000','info@aqary.demo',uid)
    RETURNING id INTO comp;

  INSERT INTO branches(org_id,company_id,name,code,city_id,address,phone)
    VALUES (org,comp,'Riyadh HQ','RUH-01',riyadh,'Olaya St','+966111111111') RETURNING id INTO br1;
  INSERT INTO branches(org_id,company_id,name,code,city_id,address,phone)
    VALUES (org,comp,'Jeddah Branch','JED-01',jeddah,'Tahlia St','+966122222222') RETURNING id INTO br2;

  -- Buildings
  INSERT INTO buildings(org_id,branch_id,name,code,floors_count,units_count,built_year,address)
    VALUES (org,br1,'Al Noor Tower','B-NOOR',10,20,2018,'Riyadh, Olaya') RETURNING id INTO bld1;
  INSERT INTO buildings(org_id,branch_id,name,code,floors_count,units_count,built_year,address)
    VALUES (org,br2,'Rawdah Plaza','B-RWD',5,10,2020,'Jeddah, Rawdah') RETURNING id INTO bld2;

  -- Floors
  INSERT INTO floors(org_id,building_id,number,name,units_count)
    VALUES (org,bld1,1,'Ground',4) RETURNING id INTO fl1;
  INSERT INTO floors(org_id,building_id,number,name,units_count)
    VALUES (org,bld1,2,'First',4) RETURNING id INTO fl2;
  INSERT INTO floors(org_id,building_id,number,name,units_count)
    VALUES (org,bld2,1,'Ground',3) RETURNING id INTO fl3;

  -- Units (mix)
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

  -- Owners
  INSERT INTO owners(org_id,full_name,national_id,email,phone,address)
    VALUES (org,'Khalid Al-Otaibi','1000000001','khalid@demo.sa','+966501111111','Riyadh') RETURNING id INTO own1;
  INSERT INTO owners(org_id,full_name,national_id,email,phone,address)
    VALUES (org,'Sara Al-Mansouri','1000000002','sara@demo.ae','+971501111111','Dubai') RETURNING id INTO own2;

  -- Tenants
  FOR i IN 1..5 LOOP
    INSERT INTO tenants(org_id,full_name,national_id,email,phone,nationality)
    VALUES (org,'Tenant '||i,'2000000'||lpad(i::text,3,'0'),'tenant'||i||'@demo.sa','+96650000000'||i,'SA')
    RETURNING id INTO ten;
    ten_ids := ten_ids || ten;
  END LOOP;

  -- Contracts for occupied units (first 5)
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

    -- Invoices (3 months per contract)
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

  -- Expenses across last 6 months
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
END $$;

GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;
