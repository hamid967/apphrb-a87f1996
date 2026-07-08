
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: writes go through SECURITY DEFINER RPC.

-- Public reader so the login page (anonymous) can fetch the allowed domain
CREATE OR REPLACE FUNCTION public.get_app_setting(_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_settings WHERE key = _key;
$$;

GRANT EXECUTE ON FUNCTION public.get_app_setting(text) TO anon, authenticated;

-- Admin/finance writer
CREATE OR REPLACE FUNCTION public.set_app_setting(_key text, _value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')) THEN
    RAISE EXCEPTION 'Forbidden: admin or finance only';
  END IF;
  INSERT INTO public.app_settings(key, value, updated_at, updated_by)
  VALUES (_key, _value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now(),
        updated_by = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_app_setting(text, text) TO authenticated;

-- Update new-user trigger to read allowed domain from app_settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_domain text;
  email_domain text;
BEGIN
  SELECT value INTO allowed_domain
    FROM public.app_settings
   WHERE key = 'allowed_email_domain';

  IF allowed_domain IS NOT NULL AND allowed_domain <> '' THEN
    email_domain := lower(split_part(new.email, '@', 2));
    IF email_domain <> lower(allowed_domain) THEN
      RAISE EXCEPTION 'Email domain "%" is not allowed', email_domain
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'employee');
  RETURN new;
END;
$$;
