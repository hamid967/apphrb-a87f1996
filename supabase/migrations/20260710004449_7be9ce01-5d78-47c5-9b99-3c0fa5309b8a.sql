
CREATE OR REPLACE FUNCTION public.cleanup_expired_user_roles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin role required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.user_roles WHERE expires_at IS NOT NULL AND expires_at <= now();
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_expired_user_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_user_roles() TO service_role;
COMMENT ON FUNCTION public.cleanup_expired_user_roles() IS
  'M2-guarded: super_admin guard (skipped when called by pg_cron with no auth.uid). service_role-only RPC.';
