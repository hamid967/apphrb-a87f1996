
-- Notify org owners/admins on subscription payment approval or rejection
CREATE OR REPLACE FUNCTION public.tg_subscription_payment_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row record;
  v_title text;
  v_body text;
  v_type text;
  v_link text := '/dashboard/settings/billing';
  v_pkg text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_pkg FROM public.packages WHERE id = NEW.package_id;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد اشتراكك';
    v_body  := 'تمت الموافقة على دفعة الاشتراك' ||
               CASE WHEN v_pkg IS NOT NULL THEN ' — الباقة: '||v_pkg ELSE '' END ||
               ' (' || NEW.amount::text || ' ' || NEW.currency || ').';
    v_type := 'success';
  ELSE
    v_title := 'تم رفض دفعة الاشتراك';
    v_body  := 'تم رفض الدفعة' ||
               COALESCE(' — السبب: ' || NEW.rejection_reason, '') || '.';
    v_type := 'warning';
  END IF;

  FOR admin_row IN
    SELECT user_id FROM public.organization_members
     WHERE org_id = NEW.org_id AND role IN ('owner','admin')
  LOOP
    INSERT INTO public.notifications(user_id, title, body, type, link)
    VALUES (admin_row.user_id, v_title, v_body, v_type, v_link);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscription_payment_notify ON public.subscription_payments;
CREATE TRIGGER trg_subscription_payment_notify
AFTER UPDATE OF status ON public.subscription_payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_subscription_payment_notify();

-- Extend reminders scan to include subscription expiry warnings + expired banners
CREATE OR REPLACE FUNCTION public.run_reminders_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rent_notifs int := 0;
  v_contract_notifs int := 0;
  v_sub_notifs int := 0;
  r record;
  admin_row record;
  v_link text;
  v_title text;
  v_body text;
  v_warn int;
  v_grace int;
BEGIN
  -- Rent charges (unchanged)
  FOR r IN
    SELECT rc.id, rc.org_id, rc.amount, rc.currency, rc.due_date, rc.tenant_id,
           t.full_name AS tenant_name, c.contract_number
      FROM public.rent_charges rc
      JOIN public.tenants   t ON t.id = rc.tenant_id
      JOIN public.contracts c ON c.id = rc.contract_id
     WHERE rc.status = 'pending'
       AND rc.due_date BETWEEN (now()::date - 7) AND (now()::date + 3)
  LOOP
    v_link  := '/dashboard/rent-charges/' || r.id::text;
    v_title := CASE WHEN r.due_date < now()::date
                    THEN 'دفعة متأخرة: ' || r.tenant_name
                    ELSE 'دفعة مستحقة قريبًا: ' || r.tenant_name END;
    v_body  := 'العقد ' || COALESCE(r.contract_number,'—') ||
               ' — ' || r.amount::text || ' ' || r.currency ||
               ' بتاريخ استحقاق ' || r.due_date::text;
    FOR admin_row IN
      SELECT user_id FROM public.organization_members
       WHERE org_id = r.org_id AND role IN ('owner','admin')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = admin_row.user_id
           AND link = v_link
           AND created_at >= now() - interval '24 hours'
      ) THEN
        INSERT INTO public.notifications(user_id, title, body, type, link)
        VALUES (admin_row.user_id, v_title, v_body,
                CASE WHEN r.due_date < now()::date THEN 'warning' ELSE 'info' END, v_link);
        v_rent_notifs := v_rent_notifs + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Contracts expiring within 30 days (unchanged)
  FOR r IN
    SELECT c.id, c.org_id, c.contract_number, c.end_date,
           COALESCE(t.full_name, '—') AS tenant_name
      FROM public.contracts c
      LEFT JOIN public.tenants t ON t.id = c.tenant_id
     WHERE c.status = 'active'
       AND c.deleted_at IS NULL
       AND c.end_date BETWEEN now()::date AND (now()::date + 30)
  LOOP
    v_link  := '/dashboard/contracts/' || r.id::text;
    v_title := 'عقد قارب على الانتهاء: ' || COALESCE(r.contract_number,'—');
    v_body  := 'المستأجر ' || r.tenant_name || ' — ينتهي في ' || r.end_date::text;
    FOR admin_row IN
      SELECT user_id FROM public.organization_members
       WHERE org_id = r.org_id AND role IN ('owner','admin')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = admin_row.user_id
           AND link = v_link
           AND created_at >= now() - interval '7 days'
      ) THEN
        INSERT INTO public.notifications(user_id, title, body, type, link)
        VALUES (admin_row.user_id, v_title, v_body, 'warning', v_link);
        v_contract_notifs := v_contract_notifs + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Subscription expiry warnings + expired banners
  SELECT COALESCE(NULLIF(public.get_app_setting('subscription.warning_days'),'')::int, 7) INTO v_warn;
  SELECT COALESCE(NULLIF(public.get_app_setting('subscription.grace_period_days'),'')::int, 3) INTO v_grace;

  FOR r IN
    SELECT s.id, s.org_id, s.end_date,
           (s.end_date::date - now()::date) AS days_remaining
      FROM public.subscriptions s
     WHERE s.deleted_at IS NULL
       AND s.status IN ('active','expired')
       AND s.end_date IS NOT NULL
       AND s.end_date BETWEEN (now()::date - (v_grace + 30)) AND (now()::date + v_warn)
  LOOP
    v_link := '/dashboard/settings/billing';
    IF r.days_remaining >= 0 THEN
      v_title := 'تنبيه: اشتراكك سينتهي خلال ' || r.days_remaining::text || ' يوم';
      v_body  := 'ينتهي اشتراكك في ' || r.end_date::text || '. جدد الآن لتفادي انقطاع الخدمة.';
    ELSIF (-r.days_remaining) <= v_grace THEN
      v_title := 'اشتراكك في فترة السماح';
      v_body  := 'انتهى اشتراكك في ' || r.end_date::text ||
                 '. متبقٍ ' || (v_grace + r.days_remaining)::text ||
                 ' يوم من فترة السماح — يرجى التجديد.';
    ELSE
      v_title := 'انتهى اشتراكك';
      v_body  := 'انتهى اشتراكك في ' || r.end_date::text || '. يرجى التجديد لاستعادة الوصول.';
    END IF;

    FOR admin_row IN
      SELECT user_id FROM public.organization_members
       WHERE org_id = r.org_id AND role IN ('owner','admin')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = admin_row.user_id
           AND link = v_link
           AND title = v_title
           AND created_at >= now() - interval '24 hours'
      ) THEN
        INSERT INTO public.notifications(user_id, title, body, type, link)
        VALUES (admin_row.user_id, v_title, v_body,
                CASE WHEN r.days_remaining < 0 THEN 'warning' ELSE 'info' END, v_link);
        v_sub_notifs := v_sub_notifs + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'rent_notifications', v_rent_notifs,
    'contract_notifications', v_contract_notifs,
    'subscription_notifications', v_sub_notifs,
    'ran_at', now()
  );
END $function$;
