REVOKE EXECUTE ON FUNCTION public.get_my_subscription_audit_trail() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_audit_trail() TO authenticated;