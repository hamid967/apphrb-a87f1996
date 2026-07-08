
DO $do$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  oa uuid := gen_random_uuid();
  ob uuid := gen_random_uuid();
  tbls text[] := ARRAY['companies','branches','buildings','owners','tenants',
                       'employees','tickets','meetings','contracts','payments',
                       'units','floors','visitors','subscriptions','org_settings',
                       'sms_providers','email_providers','api_keys','backups'];
  t text; n int; pkg uuid;
BEGIN
  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,
    email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
  VALUES
    (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'rls-a-'||substr(ua::text,1,8)||'@t.local','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
    (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'rls-b-'||substr(ub::text,1,8)||'@t.local','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);

  INSERT INTO public.organizations(id,name,slug,created_by)
    VALUES (oa,'RLS-A','rls-a-'||substr(oa::text,1,8),ua),
           (ob,'RLS-B','rls-b-'||substr(ob::text,1,8),ub);
  INSERT INTO public.organization_members(org_id,user_id,role)
    VALUES (oa,ua,'owner'),(ob,ub,'owner') ON CONFLICT DO NOTHING;

  INSERT INTO public.companies(org_id,name)      VALUES (oa,'CoA'),(ob,'CoB');
  INSERT INTO public.branches(org_id,name)       VALUES (oa,'BrA'),(ob,'BrB');
  INSERT INTO public.buildings(org_id,name)      VALUES (oa,'BdA'),(ob,'BdB');
  INSERT INTO public.floors(org_id,building_id,number)
    SELECT b.org_id,b.id,1 FROM public.buildings b WHERE b.name IN ('BdA','BdB');
  INSERT INTO public.units(org_id,building_id,code)
    SELECT b.org_id,b.id,'U1' FROM public.buildings b WHERE b.name IN ('BdA','BdB');
  INSERT INTO public.owners(org_id,full_name)    VALUES (oa,'OA'),(ob,'OB');
  INSERT INTO public.tenants(org_id,full_name)   VALUES (oa,'TA'),(ob,'TB');
  INSERT INTO public.contracts(org_id,start_date,end_date,amount)
    VALUES (oa,CURRENT_DATE,CURRENT_DATE+30,100),(ob,CURRENT_DATE,CURRENT_DATE+30,100);
  INSERT INTO public.payments(org_id,amount)     VALUES (oa,10),(ob,10);
  INSERT INTO public.employees(org_id,full_name) VALUES (oa,'EA'),(ob,'EB');
  INSERT INTO public.visitors(org_id,full_name)  VALUES (oa,'VA'),(ob,'VB');
  INSERT INTO public.tickets(org_id,subject)     VALUES (oa,'tA'),(ob,'tB');
  INSERT INTO public.meetings(org_id,title,starts_at) VALUES (oa,'mA',now()),(ob,'mB',now());
  INSERT INTO public.org_settings(org_id,key,value) VALUES (oa,'k','{}'),(ob,'k','{}');
  INSERT INTO public.sms_providers(org_id,name,provider)   VALUES (oa,'s','x'),(ob,'s','x');
  INSERT INTO public.email_providers(org_id,name,provider) VALUES (oa,'e','x'),(ob,'e','x');
  INSERT INTO public.api_keys(org_id,name,key_hash,key_prefix) VALUES (oa,'k','h','p'),(ob,'k','h','p');
  INSERT INTO public.backups(org_id,file_path)   VALUES (oa,'/a'),(ob,'/b');
  INSERT INTO public.packages(code,name) VALUES ('rls-tst-'||substr(oa::text,1,6),'p')
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO pkg;
  INSERT INTO public.subscriptions(org_id,package_id) VALUES (oa,pkg),(ob,pkg);
  -- notifications for both users (as superuser bypasses RLS)
  INSERT INTO public.notifications(user_id,title) VALUES (ua,'nA'),(ub,'nB');

  RAISE NOTICE '=== user A: foreign Org B must be INVISIBLE ===';
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',ua,'role','authenticated')::text,true);
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id=$1',t) INTO n USING ob;
    IF n=0 THEN RAISE NOTICE '  PASS % (foreign hidden)',t;
    ELSE RAISE WARNING '  FAIL % foreign rows visible=%',t,n; END IF;
  END LOOP;

  RAISE NOTICE '=== user A: own Org A must be VISIBLE ===';
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id=$1',t) INTO n USING oa;
    IF n>=1 THEN RAISE NOTICE '  PASS % own rows=%',t,n;
    ELSE RAISE WARNING '  FAIL % own rows invisible',t; END IF;
  END LOOP;

  RAISE NOTICE '=== user B: foreign Org A must be INVISIBLE ===';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',ub,'role','authenticated')::text,true);
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id=$1',t) INTO n USING oa;
    IF n=0 THEN RAISE NOTICE '  PASS % (foreign hidden)',t;
    ELSE RAISE WARNING '  FAIL % foreign rows visible=%',t,n; END IF;
  END LOOP;

  RAISE NOTICE '=== user A INSERT into Org B must be BLOCKED ===';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',ua,'role','authenticated')::text,true);
  BEGIN INSERT INTO public.tickets(org_id,subject) VALUES (ob,'HACK');
    RAISE WARNING '  FAIL tickets foreign insert allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '  PASS tickets blocked'; END;
  BEGIN INSERT INTO public.companies(org_id,name) VALUES (ob,'HACK');
    RAISE WARNING '  FAIL companies foreign insert allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '  PASS companies blocked'; END;
  BEGIN INSERT INTO public.api_keys(org_id,name,key_hash,key_prefix) VALUES (ob,'x','h','p');
    RAISE WARNING '  FAIL api_keys foreign insert allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '  PASS api_keys blocked (admin-only)'; END;
  BEGIN INSERT INTO public.org_settings(org_id,key,value) VALUES (ob,'x','{}');
    RAISE WARNING '  FAIL org_settings foreign insert allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '  PASS org_settings blocked (admin-only)'; END;
  BEGIN INSERT INTO public.notifications(user_id,title) VALUES (ub,'HACK');
    RAISE WARNING '  FAIL notifications foreign-user insert allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '  PASS notifications foreign-user blocked'; END;

  RAISE NOTICE '=== user A INSERT into own Org A must SUCCEED ===';
  BEGIN INSERT INTO public.tickets(org_id,subject) VALUES (oa,'ok');
    RAISE NOTICE '  PASS tickets own insert';
  EXCEPTION WHEN OTHERS THEN RAISE WARNING '  FAIL tickets own rejected: %',SQLERRM; END;
  BEGIN INSERT INTO public.org_settings(org_id,key,value) VALUES (oa,'k2','{}');
    RAISE NOTICE '  PASS org_settings owner insert';
  EXCEPTION WHEN OTHERS THEN RAISE WARNING '  FAIL org_settings owner rejected: %',SQLERRM; END;
  BEGIN INSERT INTO public.notifications(user_id,title) VALUES (ua,'self');
    RAISE NOTICE '  PASS notifications self insert';
  EXCEPTION WHEN OTHERS THEN RAISE WARNING '  FAIL notifications self rejected: %',SQLERRM; END;

  RAISE NOTICE '=== random unknown user must see NOTHING in any org table ===';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
    IF n=0 THEN RAISE NOTICE '  PASS % outsider empty',t;
    ELSE RAISE WARNING '  FAIL % outsider sees %',t,n; END IF;
  END LOOP;

  -- Cleanup as superuser
  PERFORM set_config('role','postgres',true);
  PERFORM set_config('request.jwt.claims','',true);
  DELETE FROM public.notifications WHERE user_id IN (ua,ub);
  DELETE FROM public.organizations  WHERE id IN (oa,ob);
  DELETE FROM public.packages       WHERE code LIKE 'rls-tst-%';
  DELETE FROM auth.users            WHERE id IN (ua,ub);
  RAISE NOTICE '=== RLS suite finished; test data cleaned up ===';
END $do$;
