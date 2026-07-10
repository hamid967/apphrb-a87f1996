
-- Multi-level approvals for expense claims.

CREATE TABLE IF NOT EXISTS public.expense_claim_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  claim_id      uuid NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  level         int  NOT NULL CHECK (level >= 1 AND level <= 5),
  required_role text NOT NULL CHECK (required_role IN ('manager','finance','owner','admin','super_admin')),
  decided_by    uuid,
  decision      text CHECK (decision IN ('approve','reject','return')),
  reason        text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, level)
);

CREATE INDEX IF NOT EXISTS idx_expense_claim_approvals_claim ON public.expense_claim_approvals(claim_id);
CREATE INDEX IF NOT EXISTS idx_expense_claim_approvals_org   ON public.expense_claim_approvals(org_id);

GRANT SELECT, INSERT, UPDATE ON public.expense_claim_approvals TO authenticated;
GRANT ALL ON public.expense_claim_approvals TO service_role;

ALTER TABLE public.expense_claim_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eca read for reviewers"
  ON public.expense_claim_approvals FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[])
    OR EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id = expense_claim_approvals.claim_id
        AND c.submitted_by = auth.uid()
    )
  );

CREATE POLICY "eca insert for reviewers"
  ON public.expense_claim_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[])
  );

CREATE POLICY "eca update for reviewers"
  ON public.expense_claim_approvals FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[])
  );

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS required_levels int NOT NULL DEFAULT 1 CHECK (required_levels BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS current_level   int NOT NULL DEFAULT 0 CHECK (current_level  BETWEEN 0 AND 5);

CREATE OR REPLACE FUNCTION public.compute_expense_required_levels(
  _org_id uuid, _amount numeric, _currency text
) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_amount, 0) >= 20000 THEN 3
    WHEN COALESCE(_amount, 0) >=  5000 THEN 2
    ELSE 1
  END
$$;

CREATE OR REPLACE FUNCTION public.expense_level_role(_level int) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _level
    WHEN 1 THEN 'manager'
    WHEN 2 THEN 'finance'
    WHEN 3 THEN 'owner'
    WHEN 4 THEN 'admin'
    ELSE 'super_admin'
  END
$$;

-- BEFORE UPDATE: transition into 'submitted' → compute required_levels, reset current_level
CREATE OR REPLACE FUNCTION public.expense_claims_seed_levels_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted'
     AND OLD.status IS DISTINCT FROM 'submitted'
     AND (OLD.status IS NULL OR OLD.status IN ('draft','rejected'))
  THEN
    NEW.required_levels := public.compute_expense_required_levels(NEW.org_id, NEW.amount, NEW.currency);
    NEW.current_level   := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER UPDATE: reseed pending sign-off rows for the fresh cycle
CREATE OR REPLACE FUNCTION public.expense_claims_seed_rows_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i int;
BEGIN
  IF NEW.status = 'submitted'
     AND OLD.status IS DISTINCT FROM 'submitted'
     AND (OLD.status IS NULL OR OLD.status IN ('draft','rejected'))
  THEN
    DELETE FROM public.expense_claim_approvals WHERE claim_id = NEW.id;
    FOR i IN 1..NEW.required_levels LOOP
      INSERT INTO public.expense_claim_approvals (org_id, claim_id, level, required_role)
      VALUES (NEW.org_id, NEW.id, i, public.expense_level_role(i));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- INSERT: if created directly as 'submitted'
CREATE OR REPLACE FUNCTION public.expense_claims_seed_levels_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    NEW.required_levels := public.compute_expense_required_levels(NEW.org_id, NEW.amount, NEW.currency);
    NEW.current_level   := 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_claims_seed_rows_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i int;
BEGIN
  IF NEW.status = 'submitted' THEN
    FOR i IN 1..NEW.required_levels LOOP
      INSERT INTO public.expense_claim_approvals (org_id, claim_id, level, required_role)
      VALUES (NEW.org_id, NEW.id, i, public.expense_level_role(i))
      ON CONFLICT (claim_id, level) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_claims_seed_levels_upd  ON public.expense_claims;
DROP TRIGGER IF EXISTS trg_expense_claims_seed_rows_upd    ON public.expense_claims;
DROP TRIGGER IF EXISTS trg_expense_claims_seed_levels_ins  ON public.expense_claims;
DROP TRIGGER IF EXISTS trg_expense_claims_seed_rows_ins    ON public.expense_claims;

CREATE TRIGGER trg_expense_claims_seed_levels_upd
  BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.expense_claims_seed_levels_upd();

CREATE TRIGGER trg_expense_claims_seed_rows_upd
  AFTER UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.expense_claims_seed_rows_upd();

CREATE TRIGGER trg_expense_claims_seed_levels_ins
  BEFORE INSERT ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.expense_claims_seed_levels_ins();

CREATE TRIGGER trg_expense_claims_seed_rows_ins
  AFTER INSERT ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.expense_claims_seed_rows_ins();
