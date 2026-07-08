CREATE OR REPLACE FUNCTION public.tg_subscription_payment_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub_id uuid;
  v_start date := now()::date;
  v_end date;
  v_cycle text := 'monthly';
  v_existing_sub_id uuid;
  v_default_pkg uuid;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;

  v_sub_id := NEW.subscription_id;

  IF v_sub_id IS NOT NULL THEN
    SELECT COALESCE(billing_cycle,'monthly') INTO v_cycle
      FROM public.subscriptions WHERE id = v_sub_id;
    v_end := (v_start + CASE v_cycle WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END)::date;
    UPDATE public.subscriptions
       SET status='active', start_date=v_start, end_date=v_end, updated_at=now()
     WHERE id = v_sub_id;

  ELSIF NEW.package_id IS NOT NULL THEN
    v_end := (v_start + interval '1 month')::date;
    INSERT INTO public.subscriptions(org_id, package_id, status, billing_cycle,
      start_date, end_date, amount, currency_code, auto_renew)
    VALUES (NEW.org_id, NEW.package_id, 'active', 'monthly',
      v_start, v_end, NEW.amount, NEW.currency, false)
    RETURNING id INTO v_sub_id;
    UPDATE public.subscription_payments SET subscription_id = v_sub_id WHERE id = NEW.id;

  ELSE
    SELECT id, COALESCE(billing_cycle,'monthly')
      INTO v_existing_sub_id, v_cycle
      FROM public.subscriptions
     WHERE org_id = NEW.org_id AND deleted_at IS NULL
     ORDER BY end_date DESC NULLS LAST, updated_at DESC
     LIMIT 1;

    v_end := (v_start + CASE v_cycle WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END)::date;

    IF v_existing_sub_id IS NOT NULL THEN
      UPDATE public.subscriptions
         SET status='active', start_date=v_start, end_date=v_end, updated_at=now()
       WHERE id = v_existing_sub_id;
      v_sub_id := v_existing_sub_id;
    ELSE
      SELECT id INTO v_default_pkg
        FROM public.packages
       WHERE COALESCE(active, true) = true
       ORDER BY price_monthly ASC NULLS LAST, created_at ASC
       LIMIT 1;

      IF v_default_pkg IS NULL THEN
        RAISE EXCEPTION 'Cannot auto-activate subscription: no active package available and payment has no package_id';
      END IF;

      INSERT INTO public.subscriptions(org_id, package_id, status, billing_cycle,
        start_date, end_date, amount, currency_code, auto_renew)
      VALUES (NEW.org_id, v_default_pkg, 'active', 'monthly',
        v_start, v_end, NEW.amount, NEW.currency, false)
      RETURNING id INTO v_sub_id;
    END IF;

    UPDATE public.subscription_payments SET subscription_id = v_sub_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END $function$;