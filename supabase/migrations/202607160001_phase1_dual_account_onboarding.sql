-- HBSpro Phase 1: dual account onboarding and account logo storage.
-- Additive only: no destructive operations.

alter table public.organizations add column if not exists account_type text not null default 'business';
alter table public.organizations add column if not exists tax_number text;
alter table public.organizations add column if not exists commercial_registration text;
alter table public.organizations add column if not exists national_address text;
alter table public.organizations add column if not exists authorized_person_name text;
alter table public.organizations add column if not exists authorized_person_phone text;
alter table public.organizations add column if not exists logo_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_account_type_check'
  ) then
    alter table public.organizations
      add constraint organizations_account_type_check
      check (account_type in ('individual', 'business'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_business_tax_number_check'
  ) then
    alter table public.organizations
      add constraint organizations_business_tax_number_check
      check (
        account_type <> 'business'
        or tax_number is null
        or tax_number ~ '^[0-9]{15}$'
      );
  end if;
end $$;

create or replace function public.register_hbspro_account(
  _account_type text,
  _name text,
  _phone text default null,
  _tax_number text default null,
  _commercial_registration text default null,
  _national_address text default null,
  _authorized_person_name text default null,
  _authorized_person_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_org uuid;
  v_type text := coalesce(nullif(trim(_account_type), ''), 'business');
begin
  if v_type not in ('individual', 'business') then
    raise exception 'Invalid account type';
  end if;

  if v_type = 'business' and coalesce(_tax_number, '') <> '' and _tax_number !~ '^[0-9]{15}$' then
    raise exception 'Business tax number must be 15 digits';
  end if;

  v_result := public.register_company(_name, _phone);
  v_org := (v_result ->> 'org_id')::uuid;

  update public.organizations
     set account_type = v_type,
         tax_number = nullif(trim(coalesce(_tax_number, '')), ''),
         commercial_registration = nullif(trim(coalesce(_commercial_registration, '')), ''),
         national_address = nullif(trim(coalesce(_national_address, '')), ''),
         authorized_person_name = nullif(trim(coalesce(_authorized_person_name, '')), ''),
         authorized_person_phone = nullif(trim(coalesce(_authorized_person_phone, '')), '')
   where id = v_org;

  return v_result || jsonb_build_object('account_type', v_type);
end;
$$;

grant execute on function public.register_hbspro_account(
  text, text, text, text, text, text, text, text
) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-logos',
  'account-logos',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'account_logos_select_for_org_members'
  ) then
    create policy account_logos_select_for_org_members
      on storage.objects
      for select
      using (
        bucket_id = 'account-logos'
        and public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'account_logos_insert_for_org_owners'
  ) then
    create policy account_logos_insert_for_org_owners
      on storage.objects
      for insert
      with check (
        bucket_id = 'account-logos'
        and public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), array['owner','admin']::public.org_role[])
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'account_logos_update_for_org_owners'
  ) then
    create policy account_logos_update_for_org_owners
      on storage.objects
      for update
      using (
        bucket_id = 'account-logos'
        and public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), array['owner','admin']::public.org_role[])
      )
      with check (
        bucket_id = 'account-logos'
        and public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), array['owner','admin']::public.org_role[])
      );
  end if;
end $$;
