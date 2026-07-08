-- Raise explicit errors when non-staff users attempt forbidden status transitions
-- on expenses and expense_reports. Without this, PostgREST returns 200 [] for
-- RLS-filtered PATCH/DELETE which is silent and hard to surface to users.

CREATE OR REPLACE FUNCTION public.guard_expense_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean;
BEGIN
  -- Service role / SQL migrations: skip (no auth.uid()).
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_staff := public.has_any_role(_uid, ARRAY['manager','finance','admin']::app_role[]);

  IF TG_OP = 'UPDATE' THEN
    -- Owner attempting to change own row
    IF OLD.user_id = _uid THEN
      -- Status must remain draft or transition into submitted only
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('draft'::expense_status, 'submitted'::expense_status) THEN
        RAISE EXCEPTION 'Forbidden: cannot set own expense status to %', NEW.status
          USING ERRCODE = '42501';
      END IF;
      -- Cannot reassign ownership
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Forbidden: cannot change expense owner'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      -- Non-owner must be staff to update
      IF NOT _is_staff THEN
        RAISE EXCEPTION 'Forbidden: only staff can modify others'' expenses'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id = _uid THEN
      IF OLD.status NOT IN ('draft'::expense_status, 'rejected'::expense_status) THEN
        RAISE EXCEPTION 'Forbidden: cannot delete expense in status %', OLD.status
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT _is_staff THEN
      RAISE EXCEPTION 'Forbidden: cannot delete others'' expenses'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_expense_status_change_trg ON public.expenses;
CREATE TRIGGER guard_expense_status_change_trg
BEFORE UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_expense_status_change();


CREATE OR REPLACE FUNCTION public.guard_report_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_staff := public.has_any_role(_uid, ARRAY['manager','finance','admin']::app_role[]);

  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id = _uid THEN
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('draft'::report_status, 'submitted'::report_status) THEN
        RAISE EXCEPTION 'Forbidden: cannot set own report status to %', NEW.status
          USING ERRCODE = '42501';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Forbidden: cannot change report owner'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT _is_staff THEN
        RAISE EXCEPTION 'Forbidden: only staff can modify others'' reports'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id = _uid THEN
      IF OLD.status <> 'draft'::report_status THEN
        RAISE EXCEPTION 'Forbidden: cannot delete report in status %', OLD.status
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT _is_staff THEN
      RAISE EXCEPTION 'Forbidden: cannot delete others'' reports'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_report_status_change_trg ON public.expense_reports;
CREATE TRIGGER guard_report_status_change_trg
BEFORE UPDATE OR DELETE ON public.expense_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_report_status_change();