GRANT EXECUTE ON FUNCTION public.admin_billing_series(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_churned_orgs(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_trial_orgs(integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_runs(bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_http_responses(text, integer) TO authenticated;