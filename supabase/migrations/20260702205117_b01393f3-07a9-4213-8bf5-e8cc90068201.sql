CREATE TYPE public.ticket_status AS ENUM ('open','assigned','in_progress','on_hold','completed','cancelled');
CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high','urgent');

CREATE TABLE public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  specialty text,
  hourly_rate numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_technicians_org ON public.technicians(org_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technicians TO authenticated;
GRANT ALL ON public.technicians TO service_role;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technicians: members read" ON public.technicians FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "technicians: staff insert" ON public.technicians FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "technicians: staff update" ON public.technicians FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "technicians: admin delete" ON public.technicians FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER trg_technicians_updated_at BEFORE UPDATE ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.maintenance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_no text NOT NULL,
  title text NOT NULL,
  description text,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  reported_by_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'open',
  scheduled_at timestamptz,
  completed_at timestamptz,
  cost numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, ticket_no)
);
CREATE INDEX idx_tickets_org_status ON public.maintenance_tickets(org_id, status);
CREATE INDEX idx_tickets_priority ON public.maintenance_tickets(org_id, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tickets TO authenticated;
GRANT ALL ON public.maintenance_tickets TO service_role;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets: members read" ON public.maintenance_tickets FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "tickets: staff insert" ON public.maintenance_tickets FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "tickets: staff update" ON public.maintenance_tickets FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "tickets: admin delete" ON public.maintenance_tickets FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();