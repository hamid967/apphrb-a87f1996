
-- 1) Extend handle_new_user to grant site-owner roles for hamid@hrhbs.com
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed_domain text;
  email_domain text;
BEGIN
  SELECT value INTO allowed_domain FROM public.app_settings WHERE key = 'allowed_email_domain';
  IF allowed_domain IS NOT NULL AND allowed_domain <> '' THEN
    email_domain := lower(split_part(new.email, '@', 2));
    IF email_domain <> lower(allowed_domain) THEN
      RAISE EXCEPTION 'Email domain "%" is not allowed', email_domain USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.raw_user_meta_data->>'avatar_url');

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'employee')
  ON CONFLICT DO NOTHING;

  IF lower(new.email) = 'hamid@hrhbs.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (new.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.organization_members(org_id, user_id, role)
      SELECT o.id, new.id, 'owner'::org_role FROM public.organizations o
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;

  RETURN new;
END;
$$;

-- 2) When a new org is created, if hamid exists, auto-add him as owner
CREATE OR REPLACE FUNCTION public.grant_hamid_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.organization_members(org_id, user_id, role)
    VALUES (NEW.id, v_uid, 'owner'::org_role)
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grant_hamid_new_org ON public.organizations;
CREATE TRIGGER trg_grant_hamid_new_org
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.grant_hamid_new_org();

-- 3) One-time backfill for existing account
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.organization_members(org_id, user_id, role)
      SELECT o.id, v_uid, 'owner'::org_role FROM public.organizations o
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
END $$;
