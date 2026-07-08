
REVOKE ALL ON public.mv_billing_pay_om FROM authenticated, anon, public;
GRANT SELECT ON public.mv_billing_pay_om TO service_role;
