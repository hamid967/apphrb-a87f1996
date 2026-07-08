
-- Unified audit trigger function
CREATE OR REPLACE FUNCTION public.tg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_entity_id uuid;
  v_org_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_api_key uuid;
  v_app_roles text[];
  v_org_role text;
  v_claims jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_entity_id := (OLD).id;
    BEGIN v_org_id := (OLD).org_id; EXCEPTION WHEN undefined_column THEN v_org_id := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
    v_entity_id := (NEW).id;
    BEGIN v_org_id := (NEW).org_id; EXCEPTION WHEN undefined_column THEN v_org_id := NULL; END;
  ELSE
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_entity_id := (NEW).id;
    BEGIN v_org_id := (NEW).org_id; EXCEPTION WHEN undefined_column THEN v_org_id := NULL; END;
  END IF;

  -- JWT claims may carry an api_key_id when the request came through an API key
  BEGIN
    v_claims := current_setting('request.jwt.claims', true)::jsonb;
    v_api_key := NULLIF(v_claims->>'api_key_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_api_key := NULL;
  END;

  IF v_actor IS NOT NULL THEN
    SELECT array_agg(role::text) INTO v_app_roles
      FROM public.user_roles WHERE user_id = v_actor;
    IF v_org_id IS NOT NULL THEN
      SELECT role::text INTO v_org_role
        FROM public.organization_members
       WHERE user_id = v_actor AND org_id = v_org_id
       LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
  VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    v_actor,
    TG_OP,
    jsonb_build_object(
      'before',    v_before,
      'after',     v_after,
      'org_id',    v_org_id,
      'api_key_id',v_api_key,
      'app_roles', to_jsonb(v_app_roles),
      'org_role',  v_org_role
    )
  );

  RETURN COALESCE(NEW, OLD);
END $$;

-- Attach trigger to every audited table (INSERT / UPDATE / DELETE)
DO $$
DECLARE t text;
        tbls text[] := ARRAY[
          'companies','branches','buildings','floors','units','owners','tenants',
          'contracts','payments','employees','visitors','tickets','meetings',
          'subscriptions','org_settings','sms_providers','email_providers',
          'api_keys','backups','organizations','organization_members',
          'properties','invoices','expenses','maintenance_tickets','tasks',
          'documents','contacts','leads','deals','commissions'
        ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = t AND relnamespace = 'public'::regnamespace) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$s', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s
           AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
           FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row()', t);
    END IF;
  END LOOP;
END $$;

-- Ensure authenticated users can insert audit rows through the SECURITY DEFINER trigger
GRANT INSERT ON public.audit_log TO authenticated;
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON public.audit_log(actor, created_at DESC);
