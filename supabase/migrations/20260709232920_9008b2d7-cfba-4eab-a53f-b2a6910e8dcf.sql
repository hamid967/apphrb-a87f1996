-- Wave 3 / Package A: ZATCA sealing infrastructure

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS zatca_counter integer,
  ADD COLUMN IF NOT EXISTS zatca_sealed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_zatca_counter_org
  ON public.invoices(org_id, zatca_counter)
  WHERE zatca_counter IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_zatca_sealed_at
  ON public.invoices(org_id, zatca_sealed_at DESC)
  WHERE zatca_sealed_at IS NOT NULL;

-- Chain audit: returns per-org sealed invoices ordered by counter and
-- flags any gap in the counter sequence or a broken hash link.
CREATE OR REPLACE FUNCTION public.zatca_chain_audit(_org_id uuid DEFAULT NULL)
 RETURNS TABLE(
   org_id uuid,
   invoice_id uuid,
   number text,
   zatca_counter integer,
   zatca_hash text,
   previous_hash text,
   zatca_sealed_at timestamptz,
   expected_previous_hash text,
   counter_gap boolean,
   hash_break boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH sealed AS (
    SELECT i.org_id, i.id AS invoice_id, i.number, i.zatca_counter,
           i.zatca_hash, i.previous_hash, i.zatca_sealed_at,
           LAG(i.zatca_hash) OVER (PARTITION BY i.org_id ORDER BY i.zatca_counter) AS prev_hash_expected,
           LAG(i.zatca_counter) OVER (PARTITION BY i.org_id ORDER BY i.zatca_counter) AS prev_counter
      FROM public.invoices i
     WHERE i.zatca_counter IS NOT NULL
       AND (_org_id IS NULL OR i.org_id = _org_id)
  )
  SELECT s.org_id, s.invoice_id, s.number, s.zatca_counter,
         s.zatca_hash, s.previous_hash, s.zatca_sealed_at,
         s.prev_hash_expected AS expected_previous_hash,
         (s.prev_counter IS NOT NULL AND s.zatca_counter <> s.prev_counter + 1) AS counter_gap,
         (s.prev_hash_expected IS NOT NULL AND s.previous_hash IS DISTINCT FROM s.prev_hash_expected) AS hash_break
    FROM sealed s
   ORDER BY s.org_id, s.zatca_counter;
$$;

REVOKE ALL ON FUNCTION public.zatca_chain_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zatca_chain_audit(uuid) TO authenticated;

-- Return the current max counter for an org under an advisory lock
CREATE OR REPLACE FUNCTION public.zatca_next_counter(_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _next integer;
BEGIN
  -- Serialize sealing per org
  PERFORM pg_advisory_xact_lock(hashtextextended('zatca:' || _org_id::text, 0));
  SELECT COALESCE(MAX(zatca_counter), 0) + 1 INTO _next
    FROM public.invoices WHERE org_id = _org_id;
  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.zatca_next_counter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zatca_next_counter(uuid) TO authenticated;