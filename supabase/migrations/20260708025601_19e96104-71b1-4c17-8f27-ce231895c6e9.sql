ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_batches;
ALTER TABLE public.expense_claims REPLICA IDENTITY FULL;
ALTER TABLE public.expense_batches REPLICA IDENTITY FULL;