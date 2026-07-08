
-- =========================================================
-- AppFolio Milestone Migration
-- =========================================================

-- ---------- profiles: link to tenant ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_linked_tenant(_tenant_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND tenant_id = _tenant_id);
$$;

-- =========================================================
-- 1) RENT PAYMENTS + AUTOPAY
-- =========================================================

CREATE TYPE public.rent_charge_status AS ENUM ('pending','paid','failed','void');
CREATE TYPE public.payment_txn_status AS ENUM ('pending','succeeded','failed','refunded');

CREATE TABLE public.payment_methods_saved (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stub',
  brand text,
  last4 text,
  is_default boolean NOT NULL DEFAULT false,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods_saved TO authenticated;
GRANT ALL ON public.payment_methods_saved TO service_role;
ALTER TABLE public.payment_methods_saved ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_tenant_manage ON public.payment_methods_saved FOR ALL TO authenticated
  USING (public.is_linked_tenant(tenant_id, auth.uid()) OR public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_linked_tenant(tenant_id, auth.uid()) OR public.is_org_admin(org_id, auth.uid()));

CREATE TABLE public.rent_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  status public.rent_charge_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rent_charges TO authenticated;
GRANT ALL ON public.rent_charges TO service_role;
ALTER TABLE public.rent_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY rc_tenant_read ON public.rent_charges FOR SELECT TO authenticated
  USING (public.is_linked_tenant(tenant_id, auth.uid()) OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY rc_admin_write ON public.rent_charges FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  charge_id uuid NOT NULL REFERENCES public.rent_charges(id) ON DELETE CASCADE,
  method_id uuid REFERENCES public.payment_methods_saved(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  status public.payment_txn_status NOT NULL DEFAULT 'pending',
  provider_ref text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pt_read ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR EXISTS (
    SELECT 1 FROM public.rent_charges rc WHERE rc.id = charge_id AND public.is_linked_tenant(rc.tenant_id, auth.uid())
  ));
CREATE POLICY pt_write ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) OR EXISTS (
    SELECT 1 FROM public.rent_charges rc WHERE rc.id = charge_id AND public.is_linked_tenant(rc.tenant_id, auth.uid())
  ));

CREATE TABLE public.autopay_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  method_id uuid NOT NULL REFERENCES public.payment_methods_saved(id) ON DELETE CASCADE,
  day_of_month int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopay_schedules TO authenticated;
GRANT ALL ON public.autopay_schedules TO service_role;
ALTER TABLE public.autopay_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ap_manage ON public.autopay_schedules FOR ALL TO authenticated
  USING (public.is_linked_tenant(tenant_id, auth.uid()) OR public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_linked_tenant(tenant_id, auth.uid()) OR public.is_org_admin(org_id, auth.uid()));

-- Day-of-month sanity via trigger (avoid CHECK for time-independence rule)
CREATE OR REPLACE FUNCTION public.tg_validate_autopay_day() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.day_of_month < 1 OR NEW.day_of_month > 28 THEN
    RAISE EXCEPTION 'day_of_month must be between 1 and 28';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER autopay_validate BEFORE INSERT OR UPDATE ON public.autopay_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_autopay_day();

-- updated_at triggers
CREATE TRIGGER pm_upd BEFORE UPDATE ON public.payment_methods_saved FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER rc_upd BEFORE UPDATE ON public.rent_charges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ap_upd BEFORE UPDATE ON public.autopay_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit
CREATE TRIGGER audit_rc AFTER INSERT OR UPDATE OR DELETE ON public.rent_charges FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();
CREATE TRIGGER audit_pt AFTER INSERT OR UPDATE OR DELETE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- RPC: generate rent charges for a contract (next N months)
CREATE OR REPLACE FUNCTION public.generate_rent_charges(_contract_id uuid, _months int DEFAULT 3)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  i int;
  created_count int := 0;
  ps date; pe date; dd date;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF c IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF NOT public.is_org_admin(c.org_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  FOR i IN 0.._months-1 LOOP
    ps := date_trunc('month', now() + (i||' month')::interval)::date;
    pe := (ps + interval '1 month' - interval '1 day')::date;
    dd := ps + 4;
    BEGIN
      INSERT INTO public.rent_charges(org_id, contract_id, tenant_id, period_start, period_end, due_date, amount, currency)
      VALUES (c.org_id, c.id, c.tenant_id, ps, pe, dd, COALESCE(c.amount/12, 0), COALESCE(c.currency_code,'SAR'));
      created_count := created_count + 1;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
  RETURN created_count;
END $$;

-- RPC: tenant pays charge (stub)
CREATE OR REPLACE FUNCTION public.tenant_pay_charge(_charge_id uuid, _method_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch record;
  txn_id uuid;
BEGIN
  SELECT * INTO ch FROM public.rent_charges WHERE id = _charge_id;
  IF ch IS NULL THEN RAISE EXCEPTION 'Charge not found'; END IF;
  IF NOT (public.is_linked_tenant(ch.tenant_id, auth.uid()) OR public.is_org_admin(ch.org_id, auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF ch.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  INSERT INTO public.payment_transactions(org_id, charge_id, method_id, amount, currency, status, provider_ref, processed_at)
  VALUES (ch.org_id, ch.id, _method_id, ch.amount, ch.currency, 'succeeded', 'stub_'||gen_random_uuid()::text, now())
  RETURNING id INTO txn_id;

  UPDATE public.rent_charges SET status='paid', paid_at=now() WHERE id=_charge_id;
  RETURN txn_id;
END $$;

-- =========================================================
-- 2) MAINTENANCE COMMENTS + tenant-facing columns
-- =========================================================

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS submitted_by_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tenant_visible_notes text;

-- Allow tenants to insert/view their own tickets
CREATE POLICY mt_tenant_read ON public.maintenance_tickets FOR SELECT TO authenticated
  USING (public.is_linked_tenant(submitted_by_tenant_id, auth.uid()));
CREATE POLICY mt_tenant_insert ON public.maintenance_tickets FOR INSERT TO authenticated
  WITH CHECK (public.is_linked_tenant(submitted_by_tenant_id, auth.uid()) AND source = 'tenant');

CREATE TABLE public.maintenance_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_type text NOT NULL DEFAULT 'staff', -- 'tenant' | 'staff' | 'tech'
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_comments TO authenticated;
GRANT ALL ON public.maintenance_comments TO service_role;
ALTER TABLE public.maintenance_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_read ON public.maintenance_comments FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.maintenance_tickets t
      WHERE t.id = ticket_id AND public.is_linked_tenant(t.submitted_by_tenant_id, auth.uid())
    )
  );
CREATE POLICY mc_write ON public.maintenance_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.maintenance_tickets t
      WHERE t.id = ticket_id AND public.is_linked_tenant(t.submitted_by_tenant_id, auth.uid())
    )
  );

-- =========================================================
-- 3) OWNER STATEMENTS
-- =========================================================

CREATE TYPE public.owner_statement_status AS ENUM ('draft','issued');

CREATE TABLE public.owner_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_income numeric(12,2) NOT NULL DEFAULT 0,
  expenses_total numeric(12,2) NOT NULL DEFAULT 0,
  management_fee numeric(12,2) NOT NULL DEFAULT 0,
  net_payout numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status public.owner_statement_status NOT NULL DEFAULT 'draft',
  pdf_url text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_statements TO authenticated;
GRANT ALL ON public.owner_statements TO service_role;
ALTER TABLE public.owner_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_read ON public.owner_statements FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_linked_property_owner(owner_id, auth.uid()));
CREATE POLICY os_write ON public.owner_statements FOR ALL TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE TABLE public.owner_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.owner_statements(id) ON DELETE CASCADE,
  kind text NOT NULL, -- 'income' | 'expense' | 'fee'
  ref_type text,
  ref_id uuid,
  amount numeric(12,2) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_statement_lines TO authenticated;
GRANT ALL ON public.owner_statement_lines TO service_role;
ALTER TABLE public.owner_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY osl_read ON public.owner_statement_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.owner_statements s
    WHERE s.id = statement_id
      AND (public.is_org_member(s.org_id, auth.uid()) OR public.is_linked_property_owner(s.owner_id, auth.uid()))
  ));
CREATE POLICY osl_write ON public.owner_statement_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.owner_statements s WHERE s.id = statement_id AND public.is_org_admin(s.org_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.owner_statements s WHERE s.id = statement_id AND public.is_org_admin(s.org_id, auth.uid())));

CREATE TRIGGER os_upd BEFORE UPDATE ON public.owner_statements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_os AFTER INSERT OR UPDATE OR DELETE ON public.owner_statements FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- RPC: generate owner statement for a month
CREATE OR REPLACE FUNCTION public.generate_owner_statement(_owner_id uuid, _month date, _mgmt_pct numeric DEFAULT 0.08)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ow record;
  ps date := date_trunc('month', _month)::date;
  pe date := (date_trunc('month', _month) + interval '1 month' - interval '1 day')::date;
  s_id uuid;
  gross numeric := 0; exp_total numeric := 0; fee numeric := 0;
BEGIN
  SELECT * INTO ow FROM public.owners WHERE id = _owner_id;
  IF ow IS NULL THEN RAISE EXCEPTION 'Owner not found'; END IF;
  IF NOT public.is_org_admin(ow.org_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  INSERT INTO public.owner_statements(org_id, owner_id, period_start, period_end, currency)
  VALUES (ow.org_id, ow.id, ps, pe, 'SAR')
  ON CONFLICT (owner_id, period_start) DO UPDATE SET updated_at = now()
  RETURNING id INTO s_id;

  DELETE FROM public.owner_statement_lines WHERE statement_id = s_id;

  -- Income lines from paid rent_charges on this owner's contracts
  INSERT INTO public.owner_statement_lines(statement_id, kind, ref_type, ref_id, amount, description)
  SELECT s_id, 'income', 'rent_charge', rc.id, rc.amount, 'Rent '||to_char(rc.period_start,'YYYY-MM')
    FROM public.rent_charges rc
    JOIN public.contracts c ON c.id = rc.contract_id
   WHERE c.owner_id = _owner_id AND rc.status = 'paid'
     AND rc.paid_at >= ps AND rc.paid_at < ps + interval '1 month';

  SELECT COALESCE(SUM(amount),0) INTO gross FROM public.owner_statement_lines WHERE statement_id = s_id AND kind='income';

  -- Expenses (org expenses linked to owner via property owner — best effort by month)
  INSERT INTO public.owner_statement_lines(statement_id, kind, ref_type, ref_id, amount, description)
  SELECT s_id, 'expense', 'expense', e.id, e.amount, COALESCE(e.description, e.category::text)
    FROM public.expenses e
   WHERE e.org_id = ow.org_id AND e.spent_at BETWEEN ps AND pe;

  SELECT COALESCE(SUM(amount),0) INTO exp_total FROM public.owner_statement_lines WHERE statement_id = s_id AND kind='expense';

  fee := round(gross * _mgmt_pct, 2);
  INSERT INTO public.owner_statement_lines(statement_id, kind, amount, description)
  VALUES (s_id, 'fee', fee, 'Management fee ('||(_mgmt_pct*100)::text||'%)');

  UPDATE public.owner_statements
     SET gross_income = gross,
         expenses_total = exp_total,
         management_fee = fee,
         net_payout = gross - exp_total - fee,
         status = 'issued',
         issued_at = now()
   WHERE id = s_id;

  RETURN s_id;
END $$;

-- =========================================================
-- 4) LISTINGS + APPLICATIONS
-- =========================================================

CREATE TYPE public.application_status AS ENUM ('new','reviewing','approved','rejected');

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  bedrooms int,
  bathrooms int,
  area numeric,
  city text,
  hero_image text,
  gallery text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT SELECT ON public.listings TO anon;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY listings_public_read ON public.listings FOR SELECT TO anon, authenticated
  USING (published = true);
CREATE POLICY listings_org_all ON public.listings FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

CREATE TRIGGER listings_upd BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.rental_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  applicant_name text NOT NULL,
  email text NOT NULL,
  phone text,
  monthly_income numeric(12,2),
  employer text,
  move_in_date date,
  credit_check_consent boolean NOT NULL DEFAULT false,
  status public.application_status NOT NULL DEFAULT 'new',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_applications TO authenticated;
GRANT INSERT ON public.rental_applications TO anon;
GRANT ALL ON public.rental_applications TO service_role;
ALTER TABLE public.rental_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY apps_public_insert ON public.rental_applications FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.published = true AND l.org_id = org_id));
CREATE POLICY apps_org_read ON public.rental_applications FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY apps_org_write ON public.rental_applications FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY apps_org_delete ON public.rental_applications FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

CREATE TRIGGER apps_upd BEFORE UPDATE ON public.rental_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 5) SEED
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_appfolio_demo()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  org uuid;
  c record;
  charges_created int := 0;
  listing_id uuid;
  stmt_id uuid;
  unit_row record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT id INTO org FROM organizations WHERE created_by = uid AND name = 'AQARY Demo' ORDER BY created_at DESC LIMIT 1;
  IF org IS NULL THEN RAISE EXCEPTION 'Run seed_demo_data first'; END IF;

  -- rent charges for all active contracts
  FOR c IN SELECT * FROM contracts WHERE org_id = org AND status = 'active' LOOP
    charges_created := charges_created + public.generate_rent_charges(c.id, 3);
  END LOOP;

  -- listings: publish first 3 vacant units
  FOR unit_row IN SELECT * FROM units WHERE org_id = org AND status = 'vacant' LIMIT 3 LOOP
    INSERT INTO listings(org_id, unit_id, slug, title, description, price, currency, bedrooms, bathrooms, area, city, published, created_by)
    VALUES (
      org, unit_row.id,
      'unit-'||lower(unit_row.code)||'-'||substr(gen_random_uuid()::text,1,6),
      'Modern unit '||unit_row.code,
      'Bright and spacious unit available for immediate move-in. Close to amenities and transit.',
      COALESCE(unit_row.rent_amount, 3500), COALESCE(unit_row.currency_code,'SAR'),
      unit_row.bedrooms, unit_row.bathrooms, unit_row.area, 'Riyadh', true, uid
    ) RETURNING id INTO listing_id;

    INSERT INTO rental_applications(org_id, listing_id, applicant_name, email, phone, monthly_income, employer, move_in_date, credit_check_consent, status)
    VALUES
      (org, listing_id, 'Ahmed Al-Sayed', 'ahmed@demo.sa', '+966500000011', 18000, 'Aramco', (now()+interval '20 day')::date, true, 'new'),
      (org, listing_id, 'Layla Farouk',   'layla@demo.sa', '+966500000012', 12000, 'STC',     (now()+interval '30 day')::date, true, 'reviewing');
  END LOOP;

  -- owner statement for previous month for each owner
  FOR c IN SELECT id FROM owners WHERE org_id = org LOOP
    stmt_id := public.generate_owner_statement(c.id, (date_trunc('month', now()) - interval '1 month')::date, 0.08);
  END LOOP;

  RETURN jsonb_build_object(
    'org_id', org,
    'rent_charges', charges_created,
    'listings_published', 3
  );
END $$;
