
-- Enums
DO $$ BEGIN
  CREATE TYPE public.deal_status AS ENUM ('offer','counter','accepted','contract','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.commission_status AS ENUM ('pending','invoiced','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deals
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  primary_contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  status public.deal_status NOT NULL DEFAULT 'offer',
  offer_amount NUMERIC(14,2),
  agreed_amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'SAR',
  offer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  close_date DATE,
  contract_url TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deals_org_idx ON public.deals(org_id, created_at DESC);
CREATE INDEX deals_property_idx ON public.deals(property_id);
CREATE INDEX deals_lead_idx ON public.deals(lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_select_members" ON public.deals FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "deals_insert_editors" ON public.deals FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "deals_update_editors" ON public.deals FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "deals_delete_admins" ON public.deals FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER deals_set_updated_at BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Commissions
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  percent NUMERIC(6,3),
  amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'SAR',
  status public.commission_status NOT NULL DEFAULT 'pending',
  paid_at DATE,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commissions_deal_idx ON public.commissions(deal_id);
CREATE INDEX commissions_org_idx ON public.commissions(org_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commissions_select_members" ON public.commissions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "commissions_insert_editors" ON public.commissions FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "commissions_update_editors" ON public.commissions FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "commissions_delete_admins" ON public.commissions FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER commissions_set_updated_at BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
