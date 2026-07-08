
CREATE OR REPLACE FUNCTION public.grant_site_owner_hamid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'hamid@hrhbs.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.organization_members(org_id, user_id, role)
      SELECT o.id, NEW.id, 'owner'::org_role FROM public.organizations o
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_hamid_created ON auth.users;
CREATE TRIGGER on_auth_user_hamid_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_site_owner_hamid();

DROP TRIGGER IF EXISTS on_auth_user_hamid_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_hamid_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_site_owner_hamid();

-- Apply now if user already exists
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.organization_members(org_id, user_id, role)
      SELECT o.id, uid, 'owner'::org_role FROM public.organizations o
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
END $$;
