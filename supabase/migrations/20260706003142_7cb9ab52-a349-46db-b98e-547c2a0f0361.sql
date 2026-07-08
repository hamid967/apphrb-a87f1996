-- Extend tg_subscription_payment_approved to always activate a subscription
-- when a payment is approved, even if neither subscription_id nor package_id
-- was provided on the payment. Fallback logic:
--   1) If NEW.subscription_id set → renew that subscription (existing behavior).
--   2) Else if NEW.package_id set → create a subscription tied to that package
--      and back-link the payment (existing behavior).
--   3) Else if the org already has any subscription → renew the most recent one.
--   4) Else → create a new monthly subscription with NULL package_id
--      (org still becomes "active" for my_access_status purposes).

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
  v_existing_pkg uuid;
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
    -- Fallback: neither package_id nor subscription_id supplied.
    -- Prefer renewing the org's most-recent subscription (keep same package).
    SELECT id, package_id, COALESCE(billing_cycle,'monthly')
      INTO v_existing_sub_id, v_existing_pkg, v_cycle
      FROM public.subscriptions
     WHERE org_id = NEW.org_id
       AND (deleted_at IS NULL)
     ORDER BY end_date DESC NULLS LAST, updated_at DESC
     LIMIT 1;

    v_end := (v_start + CASE v_cycle WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END)::date;

    IF v_existing_sub_id IS NOT NULL THEN
      UPDATE public.subscriptions
         SET status='active', start_date=v_start, end_date=v_end, updated_at=now()
       WHERE id = v_existing_sub_id;
      v_sub_id := v_existing_sub_id;
    ELSE
      INSERT INTO public.subscriptions(org_id, package_id, status, billing_cycle,
        start_date, end_date, amount, currency_code, auto_renew)
      VALUES (NEW.org_id, NULL, 'active', 'monthly',
        v_start, v_end, NEW.amount, NEW.currency, false)
      RETURNING id INTO v_sub_id;
    END IF;

    UPDATE public.subscription_payments SET subscription_id = v_sub_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END $function$;