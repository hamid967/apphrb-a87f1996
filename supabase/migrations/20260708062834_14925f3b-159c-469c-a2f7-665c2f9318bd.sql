
CREATE TABLE public.maintenance_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  supplier TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_parts_ticket ON public.maintenance_parts(ticket_id);
CREATE INDEX idx_maintenance_parts_org ON public.maintenance_parts(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_parts TO authenticated;
GRANT ALL ON public.maintenance_parts TO service_role;

ALTER TABLE public.maintenance_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts: members read" ON public.maintenance_parts
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "parts: staff insert" ON public.maintenance_parts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]));

CREATE POLICY "parts: staff update" ON public.maintenance_parts
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]));

CREATE POLICY "parts: staff delete" ON public.maintenance_parts
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'agent'::org_role]));

CREATE TRIGGER trg_maintenance_parts_updated_at
  BEFORE UPDATE ON public.maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
