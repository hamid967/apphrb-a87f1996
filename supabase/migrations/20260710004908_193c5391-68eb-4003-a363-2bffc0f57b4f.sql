
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('is_org_admin','is_org_member','is_company_member',
                        'is_linked_tenant','is_linked_property_owner',
                        'is_owner_of_contract','get_my_company_id','get_my_role',
                        'get_current_user_company_id','current_user_company_id',
                        'my_access_status','my_permissions','has_org_role')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
