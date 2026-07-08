
-- Add reviewer fields to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Restrict who can modify subscriptions:
--   * Org members can only read
--   * Super admins can modify (approve/reject/etc.)
DROP POLICY IF EXISTS "subs org access" ON public.subscriptions;

CREATE POLICY "subs org read"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (is_org_member(org_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "subs super_admin write"
  ON public.subscriptions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Trigger: auto-create a pending subscription tied to the active unified package
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_pkg_id uuid;
  v_amount numeric(12,2);
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;

  SELECT id, price_monthly INTO v_pkg_id, v_amount
  FROM public.packages
  WHERE active = true
  ORDER BY price_monthly ASC
  LIMIT 1;

  IF v_pkg_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions WHERE org_id = NEW.id AND deleted_at IS NULL
  ) THEN
    INSERT INTO public.subscriptions (org_id, package_id, status, billing_cycle, amount, currency_code, auto_renew, start_date, end_date)
    VALUES (NEW.id, v_pkg_id, 'pending', 'monthly', COALESCE(v_amount, 0), 'SAR', false, CURRENT_DATE, NULL);
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: create pending subscription for existing organizations that have none
INSERT INTO public.subscriptions (org_id, package_id, status, billing_cycle, amount, currency_code, auto_renew, start_date, end_date)
SELECT o.id,
       (SELECT id FROM public.packages WHERE active = true ORDER BY price_monthly ASC LIMIT 1),
       'pending', 'monthly', 0, 'SAR', false, CURRENT_DATE, NULL
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.org_id = o.id AND s.deleted_at IS NULL
)
  AND EXISTS (SELECT 1 FROM public.packages WHERE active = true);
