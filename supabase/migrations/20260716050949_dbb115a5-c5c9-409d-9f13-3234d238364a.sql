-- Add missing org_role enum values used by finance module (Phase 4)
alter type public.org_role add value if not exists 'finance_manager';
alter type public.org_role add value if not exists 'accountant';

-- Text-typed wrapper around has_org_role so migrations can pass text[]
-- without depending on the current enum labels at parse time.
-- Silently ignores unknown role names so future enum additions don't break callers.
create or replace function public.hbspro_has_org_role_text(
  _org uuid,
  _user uuid,
  _roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.org_id = _org
      and om.user_id = _user
      and om.role::text = any(_roles)
  )
     or public.has_role(_user, 'super_admin');
$$;

grant execute on function public.hbspro_has_org_role_text(uuid, uuid, text[])
  to authenticated, service_role;

comment on function public.hbspro_has_org_role_text(uuid, uuid, text[]) is
  'Text-typed helper for finance RLS policies. Accepts role names as text[] '
  'so callers do not need to know current org_role enum labels. '
  'Grants super_admin implicit access.';
