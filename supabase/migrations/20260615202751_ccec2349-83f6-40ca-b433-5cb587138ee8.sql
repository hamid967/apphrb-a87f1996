
-- Restrict app_settings reads: only admin/finance, plus the single public-safe key
DROP POLICY IF EXISTS "authenticated read settings" ON public.app_settings;

CREATE POLICY "app_settings staff read"
ON public.app_settings FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','finance']::app_role[]));

-- Lock down receipt_jobs owner updates so users can only flip `consumed`.
-- Anything else (status, result_json, error, expense_id, receipt_path, user_id)
-- must go through service-role server code.
CREATE OR REPLACE FUNCTION public.guard_receipt_jobs_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW; -- service role / migrations
  END IF;

  _is_staff := public.has_any_role(_uid, ARRAY['manager','finance','admin']::app_role[]);
  IF _is_staff THEN
    RETURN NEW;
  END IF;

  IF OLD.user_id <> _uid THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.status       IS DISTINCT FROM OLD.status
  OR NEW.result_json  IS DISTINCT FROM OLD.result_json
  OR NEW.error        IS DISTINCT FROM OLD.error
  OR NEW.expense_id   IS DISTINCT FROM OLD.expense_id
  OR NEW.receipt_path IS DISTINCT FROM OLD.receipt_path
  OR NEW.started_at   IS DISTINCT FROM OLD.started_at
  OR NEW.finished_at  IS DISTINCT FROM OLD.finished_at THEN
    RAISE EXCEPTION 'Forbidden: owners may only mark receipt_jobs as consumed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_receipt_jobs_owner_update ON public.receipt_jobs;
CREATE TRIGGER guard_receipt_jobs_owner_update
BEFORE UPDATE ON public.receipt_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_jobs_owner_update();
