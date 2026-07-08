
CREATE TABLE public.property_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('sale','rent_monthly','rent_yearly')),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_price numeric(14,2) NOT NULL DEFAULT 0,
  min_price numeric(14,2) NOT NULL DEFAULT 0,
  max_price numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  comparables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_notes text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_valuations_org_id_idx ON public.property_valuations(org_id);
CREATE INDEX property_valuations_property_id_idx ON public.property_valuations(property_id);
CREATE INDEX property_valuations_created_at_idx ON public.property_valuations(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_valuations TO authenticated;
GRANT ALL ON public.property_valuations TO service_role;

ALTER TABLE public.property_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view valuations"
  ON public.property_valuations FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can create valuations"
  ON public.property_valuations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Creator or org admins can delete valuations"
  ON public.property_valuations FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[])
  );
