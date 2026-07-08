-- Re-runnable seed: mark hamid@hrhbs.com as approved with admin role.
-- Usage:
--   psql "$DATABASE_URL" -f supabase/seeds/approve_hamid.sql
--   or:  bun run seed:approve-hamid
--
-- Safe to run repeatedly — approve_site_owner() is idempotent.
SELECT public.approve_site_owner('hamid@hrhbs.com', 30);