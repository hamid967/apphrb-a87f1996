-- Smoke tests for server-function queries against the current schema.
-- Purpose: fail fast if a column referenced by listTasks / listOrgMembers
-- is renamed or removed. Runs read-only; safe on any environment.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-server-fn-queries.sql

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- 1) listTasks: mirrors the PostgREST embed
--    "*, property:properties(id, title_ar, title_en),
--        contact:contacts(id, full_name),
--        lead:leads(id, stage),
--        deal:deals(id, status, notes, offer_date)"
SELECT
  t.*,
  p.id  AS property_id_ref,  p.title_ar,  p.title_en,
  c.id  AS contact_id_ref,   c.full_name,
  l.id  AS lead_id_ref,      l.stage,
  d.id  AS deal_id_ref,      d.status,    d.notes,   d.offer_date
FROM public.tasks t
LEFT JOIN public.properties p ON p.id = t.property_id
LEFT JOIN public.contacts   c ON c.id = t.contact_id
LEFT JOIN public.leads      l ON l.id = t.lead_id
LEFT JOIN public.deals      d ON d.id = t.deal_id
WHERE false;

-- 2) listOrgMembers: two-step read (org_members -> profiles by id)
SELECT om.user_id, om.role
FROM public.organization_members om
WHERE false;

SELECT pr.id, pr.full_name
FROM public.profiles pr
WHERE false;

-- 3) organization_members_with_profiles view (created earlier)
SELECT membership_id, org_id, user_id, role, joined_at,
       full_name, avatar_url, phone, language, job_title, email
FROM public.organization_members_with_profiles
WHERE false;

ROLLBACK;

\echo 'OK: server-fn query shapes match current schema'