
-- 1) Approval + trial fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Site owner is auto-approved (grandfather existing users too)
UPDATE public.profiles
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, now()),
       trial_ends_at = COALESCE(trial_ends_at, now() + interval '3650 days')
 WHERE approval_status = 'pending'
   AND (
     id IN (SELECT id FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com')
     OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id AND ur.role = 'admin')
   );

-- 2) Admin approves user → grants N-day trial (default 7)
CREATE OR REPLACE FUNCTION public.approve_user_trial(_user_id uuid, _days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF _days IS NULL OR _days <= 0 OR _days > 365 THEN
    RAISE EXCEPTION 'Invalid trial days';
  END IF;

  v_end := now() + (_days || ' days')::interval;
  UPDATE public.profiles
     SET approval_status = 'approved',
         approved_at = now(),
         approved_by = auth.uid(),
         trial_ends_at = v_end
   WHERE id = _user_id;

  INSERT INTO public.notifications(user_id, title, body, type, link)
  VALUES (_user_id,
          'تم اعتماد حسابك',
          'تم منحك تجربة مجانية لمدة ' || _days || ' أيام حتى ' || to_char(v_end, 'YYYY-MM-DD HH24:MI'),
          'success', '/dashboard');

  RETURN jsonb_build_object('user_id', _user_id, 'trial_ends_at', v_end);
END $$;

REVOKE ALL ON FUNCTION public.approve_user_trial(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_trial(uuid, int) TO authenticated;

-- 3) Admin rejects user
CREATE OR REPLACE FUNCTION public.reject_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  UPDATE public.profiles
     SET approval_status = 'rejected',
         approved_by = auth.uid(),
         trial_ends_at = NULL
   WHERE id = _user_id;
  RETURN jsonb_build_object('user_id', _user_id, 'status', 'rejected');
END $$;

REVOKE ALL ON FUNCTION public.reject_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid) TO authenticated;

-- 4) Current user access status
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

REVOKE ALL ON FUNCTION public.my_access_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_access_status() TO authenticated;
