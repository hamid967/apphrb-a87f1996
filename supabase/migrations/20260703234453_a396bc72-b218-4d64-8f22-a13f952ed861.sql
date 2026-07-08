
CREATE OR REPLACE FUNCTION public.approve_site_owner(_email text, _trial_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_caller uuid := auth.uid();
BEGIN
  -- Allow: unauthenticated seed calls for the bootstrap owner, admins, or self.
  IF v_caller IS NOT NULL
     AND NOT public.has_role(v_caller, 'admin'::app_role)
     AND lower(_email) <> 'hamid@hrhbs.com' THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User % not found', _email;
  END IF;

  INSERT INTO public.profiles(id) VALUES (v_uid)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
     SET approval_status = 'approved',
         approved_at    = COALESCE(approved_at, now()),
         approved_by    = COALESCE(approved_by, v_uid),
         trial_ends_at  = GREATEST(COALESCE(trial_ends_at, now()), now() + (_trial_days || ' days')::interval)
   WHERE id = v_uid;

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'email', _email,
    'status', 'approved',
    'trial_days', _trial_days
  );
END $$;

REVOKE ALL ON FUNCTION public.approve_site_owner(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_site_owner(text, int) TO authenticated, service_role;

-- Run once now so the tour is immediately usable.
SELECT public.approve_site_owner('hamid@hrhbs.com', 30);
