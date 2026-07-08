-- 1) Auto-approve new signups with a 14-day trial so users can access the app immediately.
--    Super-admin approval remains required only for paid subscription receipts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles(id, full_name, approval_status, approved_at, trial_ends_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    'approved',
    now(),
    now() + interval '14 days'
  )
  ON CONFLICT (id) DO UPDATE
    SET approval_status = COALESCE(NULLIF(public.profiles.approval_status,'pending'), 'approved'),
        approved_at     = COALESCE(public.profiles.approved_at, now()),
        trial_ends_at   = COALESCE(public.profiles.trial_ends_at, now() + interval '14 days');

  IF lower(NEW.email) = 'hamid@hrhbs.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

-- 2) Backfill: approve every existing pending profile and grant a 14-day trial
--    (skipping users already rejected explicitly by a super_admin).
UPDATE public.profiles
   SET approval_status = 'approved',
       approved_at     = COALESCE(approved_at, now()),
       trial_ends_at   = COALESCE(trial_ends_at, now() + interval '14 days')
 WHERE approval_status = 'pending';