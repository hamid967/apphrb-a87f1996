-- =========================================================
-- 1) handle_new_user  (profile + super_admin for hamid)
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'hamid@hrhbs.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 2) Contract activation → generate rent charges + mark unit occupied
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_contract_activated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  months int;
  step_months int;
  i int;
  ps date; pe date; dd date;
  per_amount numeric;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN RETURN NEW; END IF;

  step_months := CASE NEW.payment_frequency
    WHEN 'monthly'    THEN 1
    WHEN 'quarterly'  THEN 3
    WHEN 'semi_annual' THEN 6
    WHEN 'annual'     THEN 12
    ELSE 1 END;

  months := GREATEST(1, ((extract(year from age(NEW.end_date, NEW.start_date))*12
                       +  extract(month from age(NEW.end_date, NEW.start_date))))::int);
  per_amount := round(COALESCE(NEW.amount,0) * step_months / GREATEST(months,1), 2);

  FOR i IN 0 .. (months / step_months) - 1 LOOP
    ps := (NEW.start_date + (i * step_months || ' month')::interval)::date;
    pe := (ps + (step_months || ' month')::interval - interval '1 day')::date;
    dd := ps + 4;
    BEGIN
      INSERT INTO public.rent_charges(org_id, contract_id, tenant_id,
        period_start, period_end, due_date, amount, currency)
      VALUES (NEW.org_id, NEW.id, NEW.tenant_id, ps, pe, dd,
        per_amount, COALESCE(NEW.currency_code,'SAR'));
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;

  IF NEW.unit_id IS NOT NULL THEN
    UPDATE public.units SET status='occupied' WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contract_activated ON public.contracts;
CREATE TRIGGER trg_contract_activated
  AFTER INSERT OR UPDATE OF status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_contract_activated();

-- =========================================================
-- 3) Daily transitions job
-- =========================================================
CREATE OR REPLACE FUNCTION public.run_daily_transitions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_overdue int; v_expired_sub int; v_expiring_contracts int;
BEGIN
  UPDATE public.rent_charges
     SET status = 'overdue'
   WHERE status = 'pending' AND due_date < now()::date;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  UPDATE public.subscriptions
     SET status = 'expired'
   WHERE status = 'active' AND end_date < now()::date;
  GET DIAGNOSTICS v_expired_sub = ROW_COUNT;

  SELECT count(*) INTO v_expiring_contracts
    FROM public.contracts
   WHERE status = 'active' AND deleted_at IS NULL
     AND end_date BETWEEN now()::date AND (now()::date + 60);

  PERFORM public.run_reminders_scan();

  RETURN jsonb_build_object(
    'rent_overdue_updated', v_overdue,
    'subscriptions_expired', v_expired_sub,
    'contracts_expiring_60d', v_expiring_contracts,
    'ran_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.run_daily_transitions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_transitions() TO service_role;

-- =========================================================
-- 4) Subscription payment approval → activate subscription
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_subscription_payment_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub_id uuid;
  v_start date := now()::date;
  v_end date;
  v_cycle text := 'monthly';
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
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sub_payment_approved ON public.subscription_payments;
CREATE TRIGGER trg_sub_payment_approved
  AFTER UPDATE OF status ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_payment_approved();

-- =========================================================
-- 5) Sequential numbering per org — contracts + receipts
-- =========================================================
CREATE TABLE IF NOT EXISTS public.org_sequences (
  org_id uuid NOT NULL,
  kind text NOT NULL,
  year int NOT NULL,
  last_value int NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, kind, year)
);
GRANT SELECT ON public.org_sequences TO authenticated;
GRANT ALL ON public.org_sequences TO service_role;
ALTER TABLE public.org_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read sequences" ON public.org_sequences
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.next_org_sequence(_org uuid, _kind text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year int := extract(year from now())::int; v_next int;
BEGIN
  INSERT INTO public.org_sequences(org_id, kind, year, last_value)
  VALUES (_org, _kind, v_year, 1)
  ON CONFLICT (org_id, kind, year)
  DO UPDATE SET last_value = public.org_sequences.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN v_next;
END $$;

REVOKE ALL ON FUNCTION public.next_org_sequence(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_org_sequence(uuid,text) TO authenticated, service_role;

-- Auto-assign contract_number
CREATE OR REPLACE FUNCTION public.tg_assign_contract_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    v := public.next_org_sequence(NEW.org_id, 'contract');
    NEW.contract_number := 'C-' || to_char(now(),'YYYY') || '-' || lpad(v::text,4,'0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_assign_contract_number ON public.contracts;
CREATE TRIGGER trg_assign_contract_number
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_contract_number();

-- Add receipt_number to payment_transactions and auto-assign
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS receipt_number text;

CREATE OR REPLACE FUNCTION public.tg_assign_receipt_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF (NEW.receipt_number IS NULL OR NEW.receipt_number = '') AND NEW.status = 'succeeded' THEN
    v := public.next_org_sequence(NEW.org_id, 'receipt');
    NEW.receipt_number := 'R-' || to_char(now(),'YYYY') || '-' || lpad(v::text,4,'0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_assign_receipt_number ON public.payment_transactions;
CREATE TRIGGER trg_assign_receipt_number
  BEFORE INSERT ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_receipt_number();