
GRANT EXECUTE ON FUNCTION public.tenant_pay_charge(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_owner_statement(uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_rent_charges(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rental_application(uuid, uuid, date, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean, text, text, text, smallint, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_org_sequence(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_assistant_access(uuid, text, jsonb) TO authenticated;
-- submit_rental_application should also be callable by anon (public listing submit form)
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean, text, text, text, smallint, numeric) TO anon;
