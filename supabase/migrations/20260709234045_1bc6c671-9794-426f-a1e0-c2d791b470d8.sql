
-- Package C: CRM enhancements

-- 1) Extend leads with lost reason and metadata
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expected_close_date date;

-- 2) Lead activities timeline
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid,
  activity_type text NOT NULL, -- note | call | email | whatsapp | viewing | stage_change | assignment | contract
  from_stage text,
  to_stage text,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read lead activities" ON public.lead_activities
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

CREATE POLICY "org members write lead activities" ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

CREATE POLICY "org members update lead activities" ON public.lead_activities
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

CREATE POLICY "org members delete lead activities" ON public.lead_activities
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_org ON public.lead_activities(org_id, created_at DESC);

-- 3) Listing <-> lead matches
CREATE TABLE IF NOT EXISTS public.listing_lead_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  score numeric(5,2),
  status text NOT NULL DEFAULT 'suggested', -- suggested | sent | interested | rejected
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, listing_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_lead_matches TO authenticated;
GRANT ALL ON public.listing_lead_matches TO service_role;

ALTER TABLE public.listing_lead_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage matches" ON public.listing_lead_matches
  FOR ALL TO authenticated
  USING (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_matches_lead ON public.listing_lead_matches(lead_id);
CREATE INDEX IF NOT EXISTS idx_matches_listing ON public.listing_lead_matches(listing_id);

-- 4) Trigger: log stage changes into activities + timestamps
CREATE OR REPLACE FUNCTION public.leads_log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activities(org_id, lead_id, actor_id, activity_type, to_stage, body)
    VALUES (NEW.org_id, NEW.id, auth.uid(), 'stage_change', NEW.stage::text, 'Lead created');
    NEW.last_activity_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO public.lead_activities(org_id, lead_id, actor_id, activity_type, from_stage, to_stage, body)
      VALUES (NEW.org_id, NEW.id, auth.uid(), 'stage_change', OLD.stage::text, NEW.stage::text, NULL);
      IF NEW.stage = 'won' AND OLD.stage <> 'won' THEN
        NEW.won_at := now();
      ELSIF NEW.stage = 'lost' AND OLD.stage <> 'lost' THEN
        NEW.lost_at := now();
      END IF;
      NEW.last_activity_at := now();
    END IF;

    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.lead_activities(org_id, lead_id, actor_id, activity_type, body, metadata)
      VALUES (NEW.org_id, NEW.id, auth.uid(), 'assignment', 'Reassigned',
              jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
      NEW.last_activity_at := now();
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_log_activity ON public.leads;
CREATE TRIGGER trg_leads_log_activity
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_log_activity();

-- 5) updated_at maintenance
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_matches_updated_at ON public.listing_lead_matches;
CREATE TRIGGER trg_matches_updated_at
BEFORE UPDATE ON public.listing_lead_matches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Pipeline analytics view
CREATE OR REPLACE VIEW public.v_lead_pipeline AS
SELECT
  l.org_id,
  l.assigned_to,
  l.stage,
  COUNT(*)::int AS leads_count,
  COALESCE(SUM(l.budget_max), 0)::numeric AS pipeline_value,
  MAX(l.last_activity_at) AS last_activity_at
FROM public.leads l
GROUP BY l.org_id, l.assigned_to, l.stage;

GRANT SELECT ON public.v_lead_pipeline TO authenticated;
