
REVOKE EXECUTE ON FUNCTION public.compute_expense_required_levels(uuid, numeric, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.expense_level_role(int)                            FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.expense_claims_seed_levels_upd()                   FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.expense_claims_seed_rows_upd()                     FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.expense_claims_seed_levels_ins()                   FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.expense_claims_seed_rows_ins()                     FROM PUBLIC, authenticated, anon;
