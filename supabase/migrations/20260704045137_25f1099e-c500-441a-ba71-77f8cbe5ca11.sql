CREATE OR REPLACE VIEW public.organization_members_with_profiles
WITH (security_invoker = true) AS
SELECT
  om.id           AS membership_id,
  om.org_id,
  om.user_id,
  om.role,
  om.created_at   AS joined_at,
  p.full_name,
  p.avatar_url,
  p.phone,
  p.language,
  p.job_title,
  u.email
FROM public.organization_members om
LEFT JOIN public.profiles p ON p.id = om.user_id
LEFT JOIN auth.users     u ON u.id = om.user_id;

GRANT SELECT ON public.organization_members_with_profiles TO authenticated;
GRANT SELECT ON public.organization_members_with_profiles TO service_role;