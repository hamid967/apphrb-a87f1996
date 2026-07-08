-- Idempotency test for public.seed_core_system().
-- Runs the seed twice and asserts that permission, role, and grant counts
-- are unchanged on the second run. Exits with a non-zero status on failure.

\set ON_ERROR_STOP on

-- First run
SELECT public.seed_core_system() AS first_run \gset r1_

-- Snapshot after run 1
SELECT
  (SELECT count(*) FROM public.rbac_permissions)                    AS p1,
  (SELECT count(*) FROM public.rbac_roles WHERE slug LIKE 'core.%') AS r1,
  (SELECT count(*) FROM public.rbac_role_permissions rp
     JOIN public.rbac_roles r ON r.id = rp.role_id
    WHERE r.slug LIKE 'core.%')                                     AS g1
\gset

-- Second run
SELECT public.seed_core_system() AS second_run \gset r2_

-- Snapshot after run 2
SELECT
  (SELECT count(*) FROM public.rbac_permissions)                    AS p2,
  (SELECT count(*) FROM public.rbac_roles WHERE slug LIKE 'core.%') AS r2,
  (SELECT count(*) FROM public.rbac_role_permissions rp
     JOIN public.rbac_roles r ON r.id = rp.role_id
    WHERE r.slug LIKE 'core.%')                                     AS g2
\gset

\echo '--- Idempotency snapshot ---'
\echo 'permissions:' :p1 '→' :p2
\echo 'core_roles :' :r1 '→' :r2
\echo 'grants     :' :g1 '→' :g2

SELECT
  CASE WHEN :p1 = :p2 AND :r1 = :r2 AND :g1 = :g2
       THEN 'PASS'
       ELSE 'FAIL' END AS result,
  :p1 AS p_before, :p2 AS p_after,
  :r1 AS r_before, :r2 AS r_after,
  :g1 AS g_before, :g2 AS g_after
\gset check_

\if :{?check_result}
\endif

\echo 'Result:' :check_result

SELECT CASE WHEN :'check_result' = 'PASS' THEN 1
            ELSE 1/0 END AS assertion;