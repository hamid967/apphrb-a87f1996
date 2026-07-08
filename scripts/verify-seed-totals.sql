-- CI guard: fails (non-zero exit) if Core System totals drift from expected.
-- Expected per organization:
--   core.owner   → 26 grants
--   core.manager → 19 grants
--   core.viewer  →  9 grants
-- Expected globally: 26 permissions.

\set ON_ERROR_STOP on

-- Global permission count
SELECT count(*) AS perms FROM public.rbac_permissions \gset

-- Any core.* role whose grant count doesn't match the expected bundle
SELECT count(*) AS drift
  FROM (
    SELECT r.id, r.slug,
           (SELECT count(*) FROM public.rbac_role_permissions rp
             WHERE rp.role_id = r.id AND rp.allow) AS grants
      FROM public.rbac_roles r
     WHERE r.slug IN ('core.owner','core.manager','core.viewer')
  ) x
 WHERE (slug = 'core.owner'   AND grants <> 26)
    OR (slug = 'core.manager' AND grants <> 19)
    OR (slug = 'core.viewer'  AND grants <>  9)
\gset

-- Orgs missing any of the three core roles
SELECT count(*) AS missing_roles
  FROM public.organizations o
  CROSS JOIN (VALUES ('core.owner'),('core.manager'),('core.viewer')) s(slug)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.rbac_roles r
    WHERE r.org_id = o.id AND r.slug = s.slug
 )
\gset

\echo 'permissions   :' :perms   '(expected 26)'
\echo 'grant drift   :' :drift   '(expected 0)'
\echo 'missing roles :' :missing_roles '(expected 0)'

-- Assertion: divide-by-zero → non-zero psql exit under ON_ERROR_STOP
SELECT CASE WHEN :perms = 26 AND :drift = 0 AND :missing_roles = 0
            THEN 0 ELSE 1/0 END AS drift_check;
\echo 'PASS'