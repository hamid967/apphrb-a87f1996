
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT org_id FROM public.organization_members
   WHERE user_id = auth.uid()
   ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, org_id
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org_role org_role; v_prof record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'none'; END IF;
  IF public.has_role(auth.uid(),'admin') THEN RETURN 'super_admin'; END IF;
  SELECT role INTO v_org_role FROM public.organization_members
   WHERE user_id = auth.uid()
   ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
   LIMIT 1;
  IF v_org_role = 'owner' THEN RETURN 'company_owner'; END IF;
  IF v_org_role IN ('admin','agent','viewer') THEN RETURN 'company_staff'; END IF;
  SELECT owner_id, tenant_id INTO v_prof FROM public.profiles WHERE id = auth.uid();
  IF v_prof.tenant_id IS NOT NULL THEN RETURN 'tenant'; END IF;
  IF v_prof.owner_id  IS NOT NULL THEN RETURN 'owner_investor'; END IF;
  RETURN 'none';
END $$;

CREATE OR REPLACE FUNCTION public.register_company(_name text, _phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_slug text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _name IS NULL OR length(trim(_name)) < 2 THEN RAISE EXCEPTION 'Invalid company name'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = v_uid AND role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'You already belong to a company';
  END IF;
  v_slug := regexp_replace(lower(trim(_name)), '[^a-z0-9]+','-','g') || '-' || substr(v_uid::text,1,6);
  INSERT INTO public.organizations(name, slug, created_by) VALUES (trim(_name), v_slug, v_uid) RETURNING id INTO v_org;
  INSERT INTO public.organization_members(org_id, user_id, role) VALUES (v_org, v_uid, 'owner')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role='owner';
  IF _phone IS NOT NULL AND length(trim(_phone)) > 0 THEN
    UPDATE public.profiles SET phone = _phone WHERE id = v_uid;
  END IF;
  UPDATE public.profiles
     SET approval_status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now() + interval '14 days')
   WHERE id = v_uid;
  RETURN jsonb_build_object('org_id', v_org, 'trial_days', 14);
END $$;

GRANT EXECUTE ON FUNCTION public.register_company(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
