
CREATE TABLE IF NOT EXISTS public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  export_formats text[] NOT NULL DEFAULT ARRAY['csv','json']::text[],
  is_shared boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_templates_org ON public.report_templates(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read report_templates" ON public.report_templates
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "admins manage report_templates" ON public.report_templates
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER trg_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.seed_report_templates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  uid uuid := auth.uid();
  org uuid;
  cnt int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT id INTO org FROM organizations
   WHERE created_by = uid AND name = 'AQARY Demo'
   ORDER BY created_at DESC LIMIT 1;
  IF org IS NULL THEN RAISE EXCEPTION 'Run seed_demo_data first'; END IF;

  INSERT INTO report_templates(org_id, name, description, source, config, export_formats, created_by) VALUES
  (org, 'Deals Pipeline', 'Deal counts and pipeline value grouped by status and month.', 'deals',
    jsonb_build_object(
      'columns', ARRAY['status','offer_amount','agreed_amount','offer_date'],
      'filters', jsonb_build_object('date_field','offer_date','last_days',90),
      'group_by', ARRAY['status'],
      'segments', ARRAY['month','status'],
      'summaries', jsonb_build_array(
        jsonb_build_object('label','Pipeline value','field','agreed_amount','agg','sum'),
        jsonb_build_object('label','Deals count','field','id','agg','count')
      )
    ),
    ARRAY['csv','json'], uid),
  (org, 'Expense Claims Status', 'Approvals workflow overview by status and category.', 'expense_claims',
    jsonb_build_object(
      'columns', ARRAY['claim_number','status','amount','submitted_at','approved_at'],
      'filters', jsonb_build_object('date_field','submitted_at','last_days',60),
      'group_by', ARRAY['status'],
      'segments', ARRAY['status'],
      'summaries', jsonb_build_array(
        jsonb_build_object('label','Total claimed','field','amount','agg','sum'),
        jsonb_build_object('label','Claims','field','id','agg','count')
      )
    ),
    ARRAY['csv','json'], uid),
  (org, 'Contracts Occupancy', 'Active vs ended contracts by unit and month.', 'contracts',
    jsonb_build_object(
      'columns', ARRAY['contract_number','status','amount','start_date','end_date'],
      'filters', jsonb_build_object('status_in', ARRAY['active','ended']),
      'group_by', ARRAY['status'],
      'segments', ARRAY['status'],
      'summaries', jsonb_build_array(
        jsonb_build_object('label','Contracts','field','id','agg','count'),
        jsonb_build_object('label','Total value','field','amount','agg','sum')
      )
    ),
    ARRAY['csv','json'], uid),
  (org, 'Commissions Summary', 'Paid vs pending commissions by month and agent.', 'commissions',
    jsonb_build_object(
      'columns', ARRAY['status','amount','paid_at','created_at'],
      'filters', jsonb_build_object('date_field','created_at','last_days',180),
      'group_by', ARRAY['status'],
      'segments', ARRAY['month','status'],
      'summaries', jsonb_build_array(
        jsonb_build_object('label','Paid','field','amount','agg','sum','where','status=paid'),
        jsonb_build_object('label','Pending','field','amount','agg','sum','where','status<>paid')
      )
    ),
    ARRAY['csv','json'], uid);

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN jsonb_build_object('org_id', org, 'templates_created', cnt);
END $fn$;

GRANT EXECUTE ON FUNCTION public.seed_report_templates() TO authenticated;
