
-- Replace the profile UPDATE inside register_company with an UPSERT so the
-- 7-day trial is set even if the handle_new_user trigger hasn't populated
-- a profile row yet (edge case for admin-API-created users during tests
-- or backfills). All other behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.register_company(_name text, _phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_slug text;
  v_pkg uuid;
  v_pkg_code text;
  v_sub uuid;
  v_event_id uuid := gen_random_uuid();
  v_trial_days constant int := 7;
  v_trial_end timestamptz := now() + (v_trial_days || ' days')::interval;
  v_err text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.audit_log(id, entity, entity_id, actor, action, diff)
  VALUES (
    v_event_id, 'subscription_activation', v_uid, v_uid, 'register_company.start',
    jsonb_build_object('event_id', v_event_id, 'name', _name, 'phone', _phone,
                       'trial_days', v_trial_days, 'at', now())
  );

  IF _name IS NULL OR length(trim(_name)) < 2 THEN
    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('subscription_activation', v_uid, v_uid, 'register_company.failed',
            jsonb_build_object('event_id', v_event_id, 'reason', 'invalid_company_name'));
    RAISE EXCEPTION 'Invalid company name';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE user_id = v_uid AND role IN ('owner','admin')
  ) THEN
    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('subscription_activation', v_uid, v_uid, 'register_company.failed',
            jsonb_build_object('event_id', v_event_id, 'reason', 'already_member'));
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

  -- Upsert profile so trial_ends_at is always set, even when handle_new_user
  -- hasn't populated a profile row yet.
  INSERT INTO public.profiles(id, phone, approval_status, approved_at, trial_ends_at)
  VALUES (
    v_uid,
    NULLIF(trim(coalesce(_phone,'')), ''),
    'approved',
    now(),
    v_trial_end
  )
  ON CONFLICT (id) DO UPDATE
     SET phone           = COALESCE(EXCLUDED.phone, public.profiles.phone),
         approval_status = 'approved',
         approved_at     = COALESCE(public.profiles.approved_at, now()),
         trial_ends_at   = GREATEST(
                             COALESCE(public.profiles.trial_ends_at, now()),
                             v_trial_end
                           );

  SELECT id, code INTO v_pkg, v_pkg_code
    FROM public.packages
   WHERE active = true
   ORDER BY (code = 'basic') DESC, price_monthly ASC NULLS LAST
   LIMIT 1;

  IF v_pkg IS NULL THEN
    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('subscription_activation', v_uid, v_uid, 'register_company.no_package',
            jsonb_build_object('event_id', v_event_id, 'org_id', v_org,
                               'reason', 'no_active_package_available'));
  ELSIF EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE org_id = v_org AND deleted_at IS NULL
  ) THEN
    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('subscription_activation', v_uid, v_uid, 'register_company.subscription_exists',
            jsonb_build_object('event_id', v_event_id, 'org_id', v_org));
  ELSE
    INSERT INTO public.subscriptions(
      org_id, package_id, status, billing_cycle,
      start_date, end_date, amount, auto_renew
    ) VALUES (
      v_org, v_pkg, 'active', 'trial',
      CURRENT_DATE, CURRENT_DATE + v_trial_days, 0, false
    )
    RETURNING id INTO v_sub;

    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('subscription_activation', v_uid, v_uid, 'register_company.subscription_created',
            jsonb_build_object('event_id', v_event_id, 'org_id', v_org,
                               'subscription_id', v_sub, 'package_id', v_pkg,
                               'package_code', v_pkg_code, 'trial_days', v_trial_days,
                               'end_date', CURRENT_DATE + v_trial_days));
  END IF;

  INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
  VALUES ('subscription_activation', v_uid, v_uid, 'register_company.success',
          jsonb_build_object('event_id', v_event_id, 'org_id', v_org,
                             'subscription_id', v_sub, 'package_code', v_pkg_code,
                             'trial_days', v_trial_days, 'trial_ends_at', v_trial_end));

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'org_id', v_org,
    'subscription_id', v_sub,
    'package_code', v_pkg_code,
    'trial_days', v_trial_days,
    'trial_ends_at', v_trial_end
  );

EXCEPTION WHEN OTHERS THEN
  v_err := SQLERRM;
  BEGIN
    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('subscription_activation', COALESCE(v_uid, gen_random_uuid()), v_uid,
            'register_company.exception',
            jsonb_build_object('event_id', v_event_id, 'sqlstate', SQLSTATE,
                               'error', v_err));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END $$;

GRANT EXECUTE ON FUNCTION public.register_company(text, text) TO authenticated;
