
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  removed int := 0;
  t text;
  child_tables text[] := ARRAY[
    'commissions','deals','leads','contacts','tasks','invoices','expenses',
    'maintenance_tickets','technicians','documents','document_versions',
    'contracts','payments','tenants','owners','units','floors','buildings',
    'branches','companies','employees','visitors','tickets','meetings',
    'subscriptions','org_settings','sms_providers','email_providers',
    'api_keys','backups','notifications','org_invitations',
    'organization_members','properties','property_images'
  ];
  org_ids uuid[];
  new_seed jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT array_agg(id) INTO org_ids
    FROM organizations
   WHERE created_by = uid AND name = 'AQARY Demo';

  IF org_ids IS NOT NULL THEN
    FOREACH t IN ARRAY child_tables LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=t AND column_name='org_id'
      ) THEN
        EXECUTE format('DELETE FROM public.%I WHERE org_id = ANY($1)', t) USING org_ids;
      END IF;
    END LOOP;
    DELETE FROM organizations WHERE id = ANY(org_ids);
    removed := array_length(org_ids, 1);
  END IF;

  new_seed := public.seed_demo_data();
  RETURN jsonb_build_object('removed_orgs', COALESCE(removed,0), 'seed', new_seed);
END $$;

GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO authenticated;
