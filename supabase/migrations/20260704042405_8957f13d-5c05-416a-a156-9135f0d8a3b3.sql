
-- Seed default subscription grace/warning settings if missing
INSERT INTO public.app_settings(key, value) VALUES
  ('subscription.grace_period_days', '3'),
  ('subscription.warning_days', '7')
ON CONFLICT (key) DO NOTHING;

-- Extend my_access_status() to honor subscription end_date + grace period
CREATE OR REPLACE FUNCTION public.my_access_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  sub record;
  v_grace int;
  v_warn int;
  v_days_to_end int;
  v_days_past_end int;
  v_grace_ends_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('state','anonymous');
  END IF;

  -- Platform admins bypass all gating
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('state','active');
  END IF;

  SELECT approval_status, trial_ends_at INTO p
    FROM public.profiles WHERE id = auth.uid();
  IF p IS NULL THEN
    RETURN jsonb_build_object('state','no_profile');
  END IF;
  IF p.approval_status = 'pending' THEN
    RETURN jsonb_build_object('state','pending');
  ELSIF p.approval_status = 'rejected' THEN
    RETURN jsonb_build_object('state','rejected');
  END IF;

  SELECT COALESCE(NULLIF(public.get_app_setting('subscription.grace_period_days'),'')::int, 3) INTO v_grace;
  SELECT COALESCE(NULLIF(public.get_app_setting('subscription.warning_days'),'')::int, 7)  INTO v_warn;

  -- Latest active/expired subscription across the user's orgs
  SELECT s.end_date, s.status, s.org_id
    INTO sub
    FROM public.subscriptions s
    JOIN public.organization_members m ON m.org_id = s.org_id
   WHERE m.user_id = auth.uid()
     AND s.deleted_at IS NULL
     AND s.status IN ('active','expired')
   ORDER BY s.end_date DESC NULLS LAST
   LIMIT 1;

  IF sub.end_date IS NOT NULL THEN
    v_days_to_end   := (sub.end_date - CURRENT_DATE);
    v_days_past_end := (CURRENT_DATE - sub.end_date);
    v_grace_ends_at := (sub.end_date + (v_grace || ' days')::interval)::timestamptz;

    IF v_days_past_end > v_grace THEN
      RETURN jsonb_build_object(
        'state','expired',
        'reason','subscription_expired',
        'subscription_end_date', sub.end_date,
        'grace_period_days', v_grace,
        'grace_ends_at', v_grace_ends_at
      );
    ELSIF v_days_past_end >= 0 THEN
      RETURN jsonb_build_object(
        'state','grace',
        'subscription_end_date', sub.end_date,
        'grace_period_days', v_grace,
        'grace_ends_at', v_grace_ends_at,
        'grace_days_remaining', GREATEST(0, v_grace - v_days_past_end),
        'trial_ends_at', p.trial_ends_at
      );
    ELSIF v_days_to_end <= v_warn THEN
      RETURN jsonb_build_object(
        'state','active',
        'warning','subscription_ending_soon',
        'subscription_end_date', sub.end_date,
        'days_remaining', v_days_to_end,
        'warning_days', v_warn,
        'grace_period_days', v_grace,
        'trial_ends_at', p.trial_ends_at
      );
    END IF;
  END IF;

  -- Trial fallback (no active subscription): keep prior behavior
  IF sub.end_date IS NULL AND p.trial_ends_at IS NOT NULL AND p.trial_ends_at < now() THEN
    RETURN jsonb_build_object('state','expired','reason','trial_expired','trial_ends_at', p.trial_ends_at);
  END IF;

  RETURN jsonb_build_object('state','active','trial_ends_at', p.trial_ends_at);
END $function$;
