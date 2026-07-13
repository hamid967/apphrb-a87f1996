
-- Prior behaviour: on organization insert, a 'pending' monthly subscription
-- was created immediately, which then blocked register_company from creating
-- the 7-day trial subscription (its EXISTS check saw the pending row and
-- fell through). Keep the owner-membership side effect; drop the subscription
-- insert so activation is owned exclusively by register_company.
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
