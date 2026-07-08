
-- profiles: linked-tenant lookups
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id
  ON public.profiles USING btree (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- rent_charges: tenant portal + daily transitions
CREATE INDEX IF NOT EXISTS idx_rent_charges_tenant_id
  ON public.rent_charges USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_rent_charges_status_due
  ON public.rent_charges USING btree (status, due_date);

-- Soft-delete archive views (partial indexes only cover archived rows)
CREATE INDEX IF NOT EXISTS idx_contracts_archived
  ON public.contracts USING btree (org_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_archived
  ON public.payments USING btree (org_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- Contract detail: list only non-deleted payments per contract
CREATE INDEX IF NOT EXISTS idx_payments_contract_active
  ON public.payments USING btree (contract_id, paid_at DESC)
  WHERE deleted_at IS NULL;
