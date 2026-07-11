CREATE OR REPLACE FUNCTION public.grant_hamid_new_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.organization_members(org_id, user_id, role)
    VALUES (NEW.id, v_uid, 'owner'::org_role)
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END $function$;