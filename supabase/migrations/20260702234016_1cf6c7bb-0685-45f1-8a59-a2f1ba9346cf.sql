
REVOKE EXECUTE ON FUNCTION public.is_linked_tenant(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_rent_charges(uuid, int) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tenant_pay_charge(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_owner_statement(uuid, date, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_appfolio_demo() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_rent_charges(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_pay_charge(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_owner_statement(uuid, date, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_appfolio_demo() TO authenticated, service_role;
