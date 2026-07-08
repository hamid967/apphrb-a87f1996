CREATE OR REPLACE FUNCTION public.tg_maintenance_ticket_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NEW.status = 'completed'
     AND COALESCE(NEW.cost, 0) > 0
     AND (TG_OP = 'INSERT'
          OR OLD.status IS DISTINCT FROM 'completed'
          OR COALESCE(OLD.cost, 0) = 0)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.expenses
      WHERE org_id = NEW.org_id
        AND description = 'Maintenance ticket ' || NEW.ticket_no
    ) INTO v_exists;

    IF NOT v_exists THEN
      INSERT INTO public.expenses (
        org_id, spent_at, category, vendor, description,
        amount, vat_amount, currency, property_id, created_by
      ) VALUES (
        NEW.org_id,
        COALESCE(NEW.completed_at::date, CURRENT_DATE),
        'maintenance',
        NULL,
        'Maintenance ticket ' || NEW.ticket_no,
        NEW.cost,
        0,
        NEW.currency,
        NEW.property_id,
        NEW.created_by
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_maintenance_ticket_expense ON public.maintenance_tickets;
CREATE TRIGGER tg_maintenance_ticket_expense
AFTER INSERT OR UPDATE OF status, cost ON public.maintenance_tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_maintenance_ticket_expense();