
-- 1) Re-grant EXECUTE on admin approval RPCs to authenticated
--    (they are SECURITY DEFINER and check has_role internally).
GRANT EXECUTE ON FUNCTION public.approve_user_trial(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid) TO authenticated;

-- 2) Admins bypass the AccessGate: my_access_status() returns 'active' for admins.
CREATE OR REPLACE FUNCTION public.my_access_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('state','anonymous');
  END IF;

  -- Admins are always active, regardless of profile approval state.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('state','active');
  END IF;

  SELECT approval_status, trial_ends_at INTO p FROM public.profiles WHERE id = auth.uid();
  IF p IS NULL THEN
    RETURN jsonb_build_object('state','no_profile');
  END IF;
  IF p.approval_status = 'pending' THEN
    RETURN jsonb_build_object('state','pending');
  ELSIF p.approval_status = 'rejected' THEN
    RETURN jsonb_build_object('state','rejected');
  ELSIF p.trial_ends_at IS NOT NULL AND p.trial_ends_at < now() THEN
    RETURN jsonb_build_object('state','expired','trial_ends_at', p.trial_ends_at);
  ELSE
    RETURN jsonb_build_object('state','active','trial_ends_at', p.trial_ends_at);
  END IF;
END $$;

-- 3) Bootstrap super admin: hamid@hrhbs.com
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.profiles
       SET approval_status = 'approved',
           approved_at = COALESCE(approved_at, now()),
           trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now() + interval '365 days')
     WHERE id = v_uid;
  END IF;
END $$;

-- 4) Also mark the existing admin (63d90b93-...) approved so they aren't gated.
UPDATE public.profiles
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, now()),
       trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now() + interval '365 days')
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');
