ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE INDEX IF NOT EXISTS expense_reports_user_type_dates_idx
  ON public.expense_reports (user_id, type, start_date, end_date);