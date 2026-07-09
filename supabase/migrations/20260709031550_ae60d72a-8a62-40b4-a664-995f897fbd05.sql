
-- Allow trusted SECURITY DEFINER flows (register_company, approve_user_trial, reject_user_account)
-- to update profile approval fields by setting a session-local bypass GUC that the trigger honors.
-- Also treat both 'admin' and 'super_admin' roles as authorized.

CREATE OR REPLACE FUNCTION public.tg_profiles_restrict_approval_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.bypass_approval_trigger', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'super_admin'::app_role)
     AND (
        NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_at     IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by     IS DISTINCT FROM OLD.approved_by
     OR NEW.trial_ends_at   IS DISTINCT FROM OLD.trial_ends_at
     ) THEN
    RAISE EXCEPTION 'Only admins can modify profile approval fields';
  END IF;
  RETURN NEW;
END $$;

-- Update register_company to bypass the trigger for the self-approval it performs.
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

  PERFORM set_config('app.bypass_approval_trigger', 'on', true);
  UPDATE public.profiles
     SET approval_status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now() + interval '14 days')
   WHERE id = v_uid;
  PERFORM set_config('app.bypass_approval_trigger', 'off', true);

  RETURN jsonb_build_object('org_id', v_org, 'trial_days', 14);
END $$;

GRANT EXECUTE ON FUNCTION public.register_company(text,text) TO authenticated;
