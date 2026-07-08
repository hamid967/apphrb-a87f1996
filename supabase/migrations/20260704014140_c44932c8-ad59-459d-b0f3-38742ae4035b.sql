
CREATE OR REPLACE FUNCTION public.tg_subscription_payment_submitted_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row record;
  v_org text;
  v_link text;
BEGIN
  SELECT name INTO v_org FROM public.organizations WHERE id = NEW.org_id;
  v_link := '/dashboard/admin/subscription-payments';

  FOR admin_row IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications(user_id, title, body, type, link)
    VALUES (
      admin_row.user_id,
      'إيصال اشتراك جديد بانتظار المراجعة',
      'من: ' || COALESCE(v_org,'—') ||
      ' — المبلغ: ' || NEW.amount::text || ' ' || NEW.currency ||
      COALESCE(' — البنك: ' || NEW.bank_name, ''),
      'info',
      v_link
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscription_payment_submitted_notify ON public.subscription_payments;
CREATE TRIGGER trg_subscription_payment_submitted_notify
AFTER INSERT ON public.subscription_payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_subscription_payment_submitted_notify();
