DROP TRIGGER IF EXISTS trg_expense_batches_audit ON public.expense_batches;
CREATE TRIGGER trg_expense_batches_audit
AFTER INSERT OR UPDATE OR DELETE ON public.expense_batches
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();