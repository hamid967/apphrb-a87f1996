-- ============================================================
-- Aqari schema audit: prints RLS + GRANTs + policies per table
-- Run: psql -f scripts/audit_schema.sql
-- ============================================================
\pset pager off
\echo '=== 1. RLS status ==='
SELECT c.relname AS table, c.relrowsecurity AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 ORDER BY 1;

\echo ''
\echo '=== 2. GRANTs per table (anon / authenticated / service_role) ==='
SELECT table_name,
       string_agg(grantee||':'||privilege_type, ', ' ORDER BY grantee, privilege_type) AS grants
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND grantee IN ('anon','authenticated','service_role')
 GROUP BY table_name
 ORDER BY table_name;

\echo ''
\echo '=== 3. Policies per table ==='
SELECT tablename AS table, policyname, cmd,
       array_to_string(roles,',') AS roles,
       COALESCE(qual,'-') AS using_expr,
       COALESCE(with_check,'-') AS check_expr
  FROM pg_policies WHERE schemaname='public'
 ORDER BY tablename, cmd, policyname;
