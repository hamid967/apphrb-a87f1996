DO $$ BEGIN
  CREATE TYPE public.subscription_payment_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.packages(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  submitted_by uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SAR',
  bank_name text,
  bank_reference text,
  transferred_at date,
  receipt_url text NOT NULL,
  note text,
  status public.subscription_payment_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sub_payments_org ON public.subscription_payments(org_id);
CREATE INDEX idx_sub_payments_status ON public.subscription_payments(status);

GRANT SELECT, INSERT, UPDATE ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org admins read own payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "org admins create payments"
  ON public.subscription_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id, auth.uid()) AND submitted_by = auth.uid());

CREATE POLICY "org admins cancel own pending payments"
  ON public.subscription_payments FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()) AND status = 'pending')
  WITH CHECK (status IN ('pending','cancelled'));

CREATE POLICY "super admin manage all payments"
  ON public.subscription_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_sub_payments_updated
  BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.subscription_payments(id) ON DELETE CASCADE,
  actor uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('submitted','approved','rejected','cancelled','note')),
  from_status public.subscription_payment_status,
  to_status public.subscription_payment_status,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_approvals_payment ON public.payment_approvals(payment_id);

GRANT SELECT, INSERT ON public.payment_approvals TO authenticated;
GRANT ALL ON public.payment_approvals TO service_role;

ALTER TABLE public.payment_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read approvals for visible payments"
  ON public.payment_approvals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subscription_payments sp
     WHERE sp.id = payment_approvals.payment_id
       AND (public.is_org_admin(sp.org_id, auth.uid()) OR public.has_role(auth.uid(),'admin'))
  ));

CREATE POLICY "insert approvals as actor"
  ON public.payment_approvals FOR INSERT TO authenticated
  WITH CHECK (
    actor = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.subscription_payments sp
       WHERE sp.id = payment_approvals.payment_id
         AND (public.is_org_admin(sp.org_id, auth.uid()) OR public.has_role(auth.uid(),'admin'))
    )
  );

CREATE OR REPLACE FUNCTION public.tg_log_payment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.payment_approvals(payment_id, actor, action, to_status)
    VALUES (NEW.id, NEW.submitted_by, 'submitted', NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.payment_approvals(payment_id, actor, action, from_status, to_status, note)
    VALUES (
      NEW.id, COALESCE(auth.uid(), NEW.reviewed_by, NEW.submitted_by),
      CASE NEW.status
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'note' END,
      OLD.status, NEW.status, NEW.rejection_reason
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sub_payments_log
  AFTER INSERT OR UPDATE OF status ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_payment_status_change();