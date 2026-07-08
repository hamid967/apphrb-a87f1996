
-- 1) Backfill: promote all app_role.admin to super_admin, then drop the admin rows
INSERT INTO public.user_roles(user_id, role)
SELECT user_id, 'super_admin'::app_role FROM public.user_roles WHERE role = 'admin'::app_role
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'admin'::app_role;

-- 2) Rewrite live security-definer functions: 'admin' -> 'super_admin'
CREATE OR REPLACE FUNCTION public.approve_site_owner(_email text, _trial_days integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid; v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NOT NULL
     AND NOT public.has_role(v_caller, 'super_admin'::app_role)
     AND lower(_email) <> 'hamid@hrhbs.com' THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'User % not found', _email; END IF;
  INSERT INTO public.profiles(id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles
     SET approval_status='approved', approved_at=COALESCE(approved_at, now()),
         approved_by=COALESCE(approved_by, v_uid),
         trial_ends_at=GREATEST(COALESCE(trial_ends_at, now()), now() + (_trial_days||' days')::interval)
   WHERE id = v_uid;
  RETURN jsonb_build_object('user_id', v_uid, 'email', _email, 'status','approved','trial_days', _trial_days);
END $$;

CREATE OR REPLACE FUNCTION public.reject_user(_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;
  UPDATE public.profiles SET approval_status='rejected', approved_by=auth.uid(), trial_ends_at=NULL WHERE id=_user_id;
  RETURN jsonb_build_object('user_id', _user_id, 'status','rejected');
END $$;

CREATE OR REPLACE FUNCTION public.set_app_setting(_key text, _value text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'finance'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: super_admin or finance only';
  END IF;
  INSERT INTO public.app_settings(key,value,updated_at,updated_by)
  VALUES (_key,_value,now(),auth.uid())
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _title text, _body text, _type text DEFAULT 'info', _link text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE nid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(),'super_admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_members me
         JOIN public.organization_members target ON target.org_id = me.org_id
        WHERE me.user_id = auth.uid() AND target.user_id = _user_id
          AND me.role IN ('owner','admin')
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.notifications(user_id,title,body,type,link)
  VALUES (_user_id,_title,_body,_type,_link) RETURNING id INTO nid;
  RETURN nid;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_regenerate_establishment_no(_company_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_new text; v_old text; v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(),'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;
  SELECT establishment_no, org_id INTO v_old, v_org FROM public.companies WHERE id=_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  v_new := 'HBS-' || lpad(nextval('public.hbs_establishment_no_seq')::text, 6, '0');
  UPDATE public.companies SET establishment_no=v_new, updated_at=now() WHERE id=_company_id;
  INSERT INTO public.audit_log(entity,entity_id,actor,action,diff)
  VALUES ('companies',_company_id,auth.uid(),'regenerate_establishment_no',
    jsonb_build_object('org_id',v_org,'old_establishment_no',v_old,'new_establishment_no',v_new,'at',now()));
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.my_access_status()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; sub record; v_grace int; v_warn int; v_days_to_end int; v_days_past_end int; v_grace_ends_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('state','anonymous'); END IF;
  IF public.has_role(auth.uid(),'super_admin'::app_role) THEN RETURN jsonb_build_object('state','active'); END IF;
  SELECT approval_status, trial_ends_at INTO p FROM public.profiles WHERE id=auth.uid();
  IF p IS NULL THEN RETURN jsonb_build_object('state','no_profile'); END IF;
  IF p.approval_status='pending' THEN RETURN jsonb_build_object('state','pending');
  ELSIF p.approval_status='rejected' THEN RETURN jsonb_build_object('state','rejected'); END IF;
  SELECT COALESCE(NULLIF(public.get_app_setting('subscription.grace_period_days'),'')::int, 3) INTO v_grace;
  SELECT COALESCE(NULLIF(public.get_app_setting('subscription.warning_days'),'')::int, 7)  INTO v_warn;
  SELECT s.end_date, s.status, s.org_id INTO sub
    FROM public.subscriptions s JOIN public.organization_members m ON m.org_id=s.org_id
   WHERE m.user_id=auth.uid() AND s.deleted_at IS NULL AND s.status IN ('active','expired')
   ORDER BY s.end_date DESC NULLS LAST LIMIT 1;
  IF sub.end_date IS NOT NULL THEN
    v_days_to_end := (sub.end_date - CURRENT_DATE);
    v_days_past_end := (CURRENT_DATE - sub.end_date);
    v_grace_ends_at := (sub.end_date + (v_grace||' days')::interval)::timestamptz;
    IF v_days_past_end > v_grace THEN
      RETURN jsonb_build_object('state','expired','reason','subscription_expired','subscription_end_date',sub.end_date,'grace_period_days',v_grace,'grace_ends_at',v_grace_ends_at);
    ELSIF v_days_past_end >= 0 THEN
      RETURN jsonb_build_object('state','grace','subscription_end_date',sub.end_date,'grace_period_days',v_grace,'grace_ends_at',v_grace_ends_at,'grace_days_remaining',GREATEST(0,v_grace-v_days_past_end),'trial_ends_at',p.trial_ends_at);
    ELSIF v_days_to_end <= v_warn THEN
      RETURN jsonb_build_object('state','active','warning','subscription_ending_soon','subscription_end_date',sub.end_date,'days_remaining',v_days_to_end,'warning_days',v_warn,'grace_period_days',v_grace,'trial_ends_at',p.trial_ends_at);
    END IF;
  END IF;
  IF sub.end_date IS NULL AND p.trial_ends_at IS NOT NULL AND p.trial_ends_at < now() THEN
    RETURN jsonb_build_object('state','expired','reason','trial_expired','trial_ends_at',p.trial_ends_at);
  END IF;
  RETURN jsonb_build_object('state','active','trial_ends_at',p.trial_ends_at);
END $$;

CREATE OR REPLACE FUNCTION public.verify_my_establishment(_est_no text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.companies c
        JOIN public.organization_members m ON m.org_id=c.org_id
       WHERE upper(trim(c.establishment_no))=upper(trim(_est_no))
         AND m.user_id=auth.uid() AND c.deleted_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org_role org_role; v_prof record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'none'; END IF;
  IF public.has_role(auth.uid(),'super_admin') THEN RETURN 'super_admin'; END IF;
  SELECT role INTO v_org_role FROM public.organization_members
   WHERE user_id=auth.uid()
   ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1;
  IF v_org_role='owner' THEN RETURN 'company_owner'; END IF;
  IF v_org_role IN ('admin','agent','viewer') THEN RETURN 'company_staff'; END IF;
  SELECT owner_id, tenant_id INTO v_prof FROM public.profiles WHERE id=auth.uid();
  IF v_prof.tenant_id IS NOT NULL THEN RETURN 'tenant'; END IF;
  IF v_prof.owner_id IS NOT NULL THEN RETURN 'owner_investor'; END IF;
  RETURN 'none';
END $$;

CREATE OR REPLACE FUNCTION public.tg_profiles_block_link_selfassign()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.owner_id IS DISTINCT FROM OLD.owner_id) OR (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    IF NOT public.has_role(auth.uid(),'super_admin'::app_role) THEN
      RAISE EXCEPTION 'Only super_admin can change linked owner_id/tenant_id on profiles';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_profiles_block_link_selfinsert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.owner_id IS NOT NULL OR NEW.tenant_id IS NOT NULL)
     AND NOT public.has_role(auth.uid(),'super_admin'::app_role) THEN
    NEW.owner_id := NULL; NEW.tenant_id := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_subscription_payment_submitted_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE admin_row record; v_org text; v_link text;
BEGIN
  SELECT name INTO v_org FROM public.organizations WHERE id = NEW.org_id;
  v_link := '/dashboard/admin/subscription-payments';
  FOR admin_row IN SELECT user_id FROM public.user_roles WHERE role='super_admin' LOOP
    INSERT INTO public.notifications(user_id,title,body,type,link)
    VALUES (admin_row.user_id,'إيصال اشتراك جديد بانتظار المراجعة',
      'من: '||COALESCE(v_org,'—')||' — المبلغ: '||NEW.amount::text||' '||NEW.currency||
      COALESCE(' — البنك: '||NEW.bank_name,''), 'info', v_link);
  END LOOP;
  RETURN NEW;
END $$;

-- 3) Hamid bootstrap: only super_admin now
CREATE OR REPLACE FUNCTION public.grant_site_owner_hamid()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF lower(NEW.email) = 'hamid@hrhbs.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.organization_members(org_id, user_id, role)
      SELECT o.id, NEW.id, 'owner'::org_role FROM public.organizations o
      ON CONFLICT (org_id, user_id) DO UPDATE SET role='owner';
  END IF;
  RETURN NEW;
END $$;

-- 4) RLS policies that reference app_role.admin -> super_admin
DROP POLICY IF EXISTS "app_settings staff read" ON public.app_settings;
CREATE POLICY "app_settings staff read" ON public.app_settings FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'finance'::app_role]));

DROP POLICY IF EXISTS "audit staff read" ON public.audit_log;
CREATE POLICY "audit staff read" ON public.audit_log FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['manager'::app_role,'finance'::app_role,'super_admin'::app_role]));

DROP POLICY IF EXISTS "profiles staff update" ON public.profiles;
CREATE POLICY "profiles staff update" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'finance'::app_role]));

DROP POLICY IF EXISTS "roles self or staff read" ON public.user_roles;
CREATE POLICY "roles self or staff read" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid()
   OR public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'finance'::app_role,'manager'::app_role]));
