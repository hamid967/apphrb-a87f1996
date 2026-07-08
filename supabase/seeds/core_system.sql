-- =============================================================================
-- Core System seed — idempotent, with optional dry-run
-- -----------------------------------------------------------------------------
-- Modes:
--   Apply   (default):  bun run seed:core-system
--   Dry-run:            bun run seed:core-system:dry
--                       psql "$DATABASE_URL" -v dry_run=1 -f supabase/seeds/core_system.sql
--
-- Dry-run performs no writes. It calls public.seed_core_system_plan() which
-- reports preconditions and everything that would be created/updated.
-- =============================================================================

\if :{?dry_run}
  \echo '=== DRY RUN — no changes will be written ==='
  SELECT jsonb_pretty(public.seed_core_system_plan()) AS plan;
\else
  \echo '=== APPLY — seeding Core System ==='
  SELECT public.seed_core_system();

  \echo '--- Core roles per organization ---'
  SELECT o.name AS organization, r.slug AS role, r.name AS role_name,
         (SELECT count(*) FROM public.rbac_role_permissions rp
           WHERE rp.role_id = r.id AND rp.allow) AS grants
    FROM public.rbac_roles r
    JOIN public.organizations o ON o.id = r.org_id
   WHERE r.slug LIKE 'core.%'
   ORDER BY o.name, r.slug;

  \echo '--- Totals ---'
  SELECT
    (SELECT count(*) FROM public.rbac_permissions)                    AS permissions,
    (SELECT count(*) FROM public.rbac_roles WHERE slug LIKE 'core.%') AS core_roles,
    (SELECT count(*) FROM public.rbac_role_permissions rp
       JOIN public.rbac_roles r ON r.id = rp.role_id
      WHERE r.slug LIKE 'core.%')                                     AS grants;

  \echo '--- Site-owner (admin) approval status ---'
  SELECT p.id AS user_id, p.approval_status, p.approved_at, p.trial_ends_at, true AS is_admin
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
   ORDER BY p.approved_at DESC NULLS LAST;
\endif