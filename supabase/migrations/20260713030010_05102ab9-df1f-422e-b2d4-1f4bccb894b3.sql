-- Grant a 7-day free trial for new companies on registration.
-- Sets the profile trial window to 7 days AND creates an active
-- subscription row (basic package) with a 7-day end_date so
-- my_access_status() reports the account as "active".

CREATE OR REPLACE FUNCTION public.register_company(_name text, _phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_slug text;
  v_pkg uuid;
  v_trial_days constant int := 7;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _name IS NULL OR length(trim(_name)) < 2 THEN
    RAISE EXCEPTION 'Invalid company name';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE user_id = v_uid AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'You already belong to a company';
  END IF;

  v_slug := regexp_replace(lower(trim(_name)), '[^a-z0-9]+','-','g')
            || '-' || substr(v_uid::text,1,6);

  INSERT INTO public.organizations(name, slug, created_by)
  VALUES (trim(_name), v_slug, v_uid)
  RETURNING id INTO v_org;

  INSERT INTO public.organization_members(org_id, user_id, role)
  VALUES (v_org, v_uid, 'owner')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role='owner';

  IF _phone IS NOT NULL AND length(trim(_phone)) > 0 THEN
    UPDATE public.profiles SET phone = _phone WHERE id = v_uid;
  END IF;

  UPDATE public.profiles
     SET approval_status = 'approved',
         approved_at     = COALESCE(approved_at, now()),
         trial_ends_at   = GREATEST(
                              COALESCE(trial_ends_at, now()),
                              now() + (v_trial_days || ' days')::interval
                           )
   WHERE id = v_uid;

  -- Pick a default package for the trial subscription (prefer 'basic').
  SELECT id INTO v_pkg
    FROM public.packages
   WHERE active = true
   ORDER BY (code = 'basic') DESC, price_monthly ASC NULLS LAST
   LIMIT 1;

  IF v_pkg IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE org_id = v_org AND deleted_at IS NULL
  ) THEN
    INSERT INTO public.subscriptions(
      org_id, package_id, status, billing_cycle,
      start_date, end_date, amount, auto_renew
    ) VALUES (
      v_org, v_pkg, 'active', 'trial',
      CURRENT_DATE, CURRENT_DATE + v_trial_days, 0, false
    );
  END IF;

  RETURN jsonb_build_object(
    'org_id', v_org,
    'trial_days', v_trial_days,
    'trial_ends_at', (now() + (v_trial_days || ' days')::interval)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.register_company(text, text) TO authenticated;