
-- Reminders scanner: notifies org admins about upcoming rent charges and expiring contracts
CREATE OR REPLACE FUNCTION public.run_reminders_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rent_notifs int := 0;
  v_contract_notifs int := 0;
  r record;
  admin_row record;
  v_link text;
  v_title text;
  v_body text;
BEGIN
  -- 1) Upcoming/overdue rent charges (due within 3 days, or overdue up to 7 days)
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
                CASE WHEN r.due_date < now()::date THEN 'warning' ELSE 'info' END,
                v_link);
        v_rent_notifs := v_rent_notifs + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- 2) Contracts expiring within 30 days
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

  RETURN jsonb_build_object(
    'rent_notifications', v_rent_notifs,
    'contract_notifications', v_contract_notifs,
    'ran_at', now()
  );
END $$;

-- Lock down: only service_role and admin app-role callers can execute directly
REVOKE ALL ON FUNCTION public.run_reminders_scan() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_reminders_scan() TO service_role;

-- Schedule: daily at 08:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('reminders-daily-scan')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reminders-daily-scan');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reminders-daily-scan',
  '0 8 * * *',
  $$ SELECT public.run_reminders_scan(); $$
);
