
CREATE OR REPLACE FUNCTION public.tg_validate_autopay_method()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_tenant uuid;
  m_org uuid;
BEGIN
  SELECT tenant_id, org_id INTO m_tenant, m_org
  FROM public.payment_methods_saved
  WHERE id = NEW.method_id;

  IF m_tenant IS NULL THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '23514';
  END IF;

  IF m_tenant <> NEW.tenant_id OR m_org <> NEW.org_id THEN
    RAISE EXCEPTION 'Payment method does not belong to this tenant/organization' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autopay_validate_method ON public.autopay_schedules;
CREATE TRIGGER autopay_validate_method
BEFORE INSERT OR UPDATE OF method_id, tenant_id, org_id
ON public.autopay_schedules
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_autopay_method();
