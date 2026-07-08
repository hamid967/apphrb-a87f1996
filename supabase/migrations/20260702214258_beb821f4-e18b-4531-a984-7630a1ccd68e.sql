
DO $$ BEGIN
  CREATE TYPE public.expense_claim_status AS ENUM ('draft','submitted','in_review','rejected','approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claim_number text NOT NULL,
  status public.expense_claim_status NOT NULL DEFAULT 'draft',
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  submitted_by uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_expense_claims_org_status ON public.expense_claims(org_id, status);
CREATE INDEX IF NOT EXISTS idx_expense_claims_contract ON public.expense_claims(contract_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_invoice ON public.expense_claims(invoice_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_expense ON public.expense_claims(expense_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO authenticated;
GRANT ALL ON public.expense_claims TO service_role;

ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read expense_claims" ON public.expense_claims
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "admins manage expense_claims" ON public.expense_claims
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE POLICY "submitter inserts own draft" ON public.expense_claims
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND submitted_by = auth.uid());

CREATE POLICY "submitter updates own draft" ON public.expense_claims
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'draft')
  WITH CHECK (submitted_by = auth.uid());

CREATE TRIGGER trg_expense_claims_updated_at
  BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_expense_claims_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

CREATE OR REPLACE FUNCTION public.seed_expense_claims()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  uid uuid := auth.uid();
  org uuid;
  contract_ids uuid[];
  invoice_ids uuid[];
  expense_ids uuid[];
  statuses public.expense_claim_status[] := ARRAY['draft','submitted','in_review','rejected','approved']::public.expense_claim_status[];
  st public.expense_claim_status;
  i int;
  cnt int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT id INTO org FROM organizations
   WHERE created_by = uid AND name = 'AQARY Demo'
   ORDER BY created_at DESC LIMIT 1;
  IF org IS NULL THEN RAISE EXCEPTION 'No demo org — run seed_demo_data first'; END IF;

  SELECT array_agg(id) INTO contract_ids FROM contracts WHERE org_id = org;
  SELECT array_agg(id) INTO invoice_ids  FROM invoices  WHERE org_id = org;
  SELECT array_agg(id) INTO expense_ids  FROM expenses  WHERE org_id = org;

  FOR i IN 1..10 LOOP
    st := statuses[1 + ((i-1) % 5)];
    INSERT INTO expense_claims(
      org_id, claim_number, status, contract_id, invoice_id, expense_id,
      title, description, amount, currency, submitted_by, reviewed_by,
      submitted_at, reviewed_at, approved_at, rejection_reason
    ) VALUES (
      org,
      'CLM-'||to_char(now(),'YYYY')||'-'||lpad(i::text,4,'0'),
      st,
      contract_ids[1 + ((i-1) % GREATEST(COALESCE(array_length(contract_ids,1),1),1))],
      invoice_ids[1 + ((i-1) % GREATEST(COALESCE(array_length(invoice_ids,1),1),1))],
      expense_ids[1 + ((i-1) % GREATEST(COALESCE(array_length(expense_ids,1),1),1))],
      'Reimbursement claim #'||i,
      (ARRAY['Site visit fuel','Maintenance parts','Client meeting','Marketing print','Office supplies'])[1+((i-1)%5)],
      250 + i*75, 'SAR', uid,
      CASE WHEN st IN ('in_review','rejected','approved') THEN uid ELSE NULL END,
      CASE WHEN st <> 'draft' THEN now() - ((10-i)||' day')::interval ELSE NULL END,
      CASE WHEN st IN ('in_review','rejected','approved') THEN now() - ((6-(i%6))||' day')::interval ELSE NULL END,
      CASE WHEN st = 'approved' THEN now() - ((i%3)||' day')::interval ELSE NULL END,
      CASE WHEN st = 'rejected' THEN 'Missing receipt attachment' ELSE NULL END
    );
    cnt := cnt + 1;
  END LOOP;

  RETURN jsonb_build_object('org_id', org, 'claims_created', cnt);
END $fn$;

GRANT EXECUTE ON FUNCTION public.seed_expense_claims() TO authenticated;
