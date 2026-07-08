
CREATE TABLE public.property_viewings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_name text NOT NULL,
  visitor_phone text,
  visitor_email text,
  scheduled_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 5 AND 480),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  source text NOT NULL DEFAULT 'internal' CHECK (source IN ('internal','portal','website','whatsapp','other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_viewings_org_id_idx ON public.property_viewings(org_id);
CREATE INDEX property_viewings_property_id_idx ON public.property_viewings(property_id);
CREATE INDEX property_viewings_scheduled_at_idx ON public.property_viewings(scheduled_at);
CREATE INDEX property_viewings_status_idx ON public.property_viewings(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_viewings TO authenticated;
GRANT ALL ON public.property_viewings TO service_role;

ALTER TABLE public.property_viewings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view viewings"
  ON public.property_viewings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can create viewings"
  ON public.property_viewings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Org members can update viewings"
  ON public.property_viewings FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Creator or org admins can delete viewings"
  ON public.property_viewings FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[])
  );

CREATE TRIGGER update_property_viewings_updated_at
BEFORE UPDATE ON public.property_viewings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
