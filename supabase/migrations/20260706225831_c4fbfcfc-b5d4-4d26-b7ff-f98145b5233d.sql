
CREATE TABLE public.expense_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  batch_number TEXT NOT NULL,
  title TEXT NOT NULL,
  batch_type TEXT NOT NULL DEFAULT 'trip' CHECK (batch_type IN ('trip','project')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  start_date DATE,
  end_date DATE,
  submitted_by UUID,
  reviewed_by UUID,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SAR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (org_id, batch_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_batches TO authenticated;
GRANT ALL ON public.expense_batches TO service_role;

ALTER TABLE public.expense_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members view batches"
ON public.expense_batches FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m
          WHERE m.org_id = expense_batches.org_id AND m.user_id = auth.uid())
);

CREATE POLICY "submitter creates batches"
ON public.expense_batches FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.organization_members m
              WHERE m.org_id = expense_batches.org_id AND m.user_id = auth.uid())
);

CREATE POLICY "submitter updates own drafts"
ON public.expense_batches FOR UPDATE
TO authenticated
USING (submitted_by = auth.uid() AND status IN ('draft','rejected'))
WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "admins update any batch"
ON public.expense_batches FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "submitter deletes own drafts"
ON public.expense_batches FOR DELETE
TO authenticated
USING (submitted_by = auth.uid() AND status = 'draft');

ALTER TABLE public.expense_claims
  ADD COLUMN batch_id UUID REFERENCES public.expense_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_expense_claims_batch_id ON public.expense_claims(batch_id);

CREATE TRIGGER trg_expense_batches_updated_at
BEFORE UPDATE ON public.expense_batches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.recalc_expense_batch_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_batch UUID;
BEGIN
  target_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  IF target_batch IS NOT NULL THEN
    UPDATE public.expense_batches b
    SET total_amount = COALESCE((
      SELECT SUM(amount) FROM public.expense_claims
      WHERE batch_id = target_batch AND deleted_at IS NULL
    ), 0)
    WHERE b.id = target_batch;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_batch_total_ins
AFTER INSERT ON public.expense_claims
FOR EACH ROW EXECUTE FUNCTION public.recalc_expense_batch_total();

CREATE TRIGGER trg_recalc_batch_total_upd
AFTER UPDATE OF amount, batch_id, deleted_at ON public.expense_claims
FOR EACH ROW EXECUTE FUNCTION public.recalc_expense_batch_total();

CREATE TRIGGER trg_recalc_batch_total_del
AFTER DELETE ON public.expense_claims
FOR EACH ROW EXECUTE FUNCTION public.recalc_expense_batch_total();
