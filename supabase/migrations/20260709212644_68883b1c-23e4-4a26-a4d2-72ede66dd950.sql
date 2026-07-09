CREATE INDEX IF NOT EXISTS idx_properties_org_created
  ON public.properties(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_members_user_created
  ON public.organization_members(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_org_paid_at
  ON public.payments(org_id, paid_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;