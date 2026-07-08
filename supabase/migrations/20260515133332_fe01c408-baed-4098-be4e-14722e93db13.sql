-- Remove duplicate policies, keep oldest per case-insensitive name
DELETE FROM public.policies p
USING public.policies q
WHERE lower(p.name) = lower(q.name)
  AND p.created_at > q.created_at;

-- Handle exact-tie created_at duplicates
DELETE FROM public.policies p
USING public.policies q
WHERE lower(p.name) = lower(q.name)
  AND p.created_at = q.created_at
  AND p.id > q.id;

CREATE UNIQUE INDEX IF NOT EXISTS policies_name_unique_ci
  ON public.policies (lower(name));