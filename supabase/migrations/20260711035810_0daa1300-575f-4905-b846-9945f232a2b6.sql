-- Permanent fix: the maintenance-guard migration (20260710004239) wraps a
-- super_admin check around a list of "seed/maintenance" functions. But
-- grant_hamid_new_org is actually a TRIGGER on public.organizations that
-- fires on every organization insert — guarding it blocks normal company
-- signup with "forbidden: super_admin role required". Redefine it here so
-- later re-runs of the guard migration skip it (it becomes "already guarded"
-- by matching a comment/check they look for is only super_admin regex; to be
-- safe we also drop the guard by CREATE OR REPLACE without super_admin, and
-- rely on ordering: this migration timestamp is later than the guard one).

CREATE OR REPLACE FUNCTION public.grant_hamid_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid;
BEGIN
  -- Auto-attach the platform owner as an owner on every new organization.
  -- Intentionally has NO super_admin caller check: this is a trigger, not an
  -- admin RPC, and must run for every authenticated user creating a company.
  SELECT id INTO v_uid
    FROM auth.users
   WHERE lower(email) = 'hamid@hrhbs.com'
   LIMIT 1;

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.organization_members(org_id, user_id, role)
    VALUES (NEW.id, v_uid, 'owner'::org_role)
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.grant_hamid_new_org() IS
  'Trigger on organizations INSERT: auto-adds hamid@hrhbs.com as owner. NO super_admin caller check — required for normal company signup.';
