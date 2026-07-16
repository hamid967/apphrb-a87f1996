-- HBSpro Phase 3: maintenance vendors, requests, preventive schedules.
-- Additive only: avoids destructive schema or data operations.

alter type public.org_role add value if not exists 'finance_manager';
alter type public.org_role add value if not exists 'accountant';
alter type public.org_role add value if not exists 'maintenance_supervisor';

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
      from public.organization_members
     where org_id = _org
       and user_id = _user
       and role::text = any(_roles)
  );
$$;

grant execute on function public.hbspro_has_org_role_text(uuid, uuid, text[]) to authenticated, service_role;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  specialty text not null default 'general',
  phone text,
  email text,
  commercial_registration text,
  tax_number text,
  rating numeric(2,1) not null default 3,
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'general',
  priority text not null default 'medium',
  status text not null default 'new',
  assigned_vendor_id uuid references public.vendors(id) on delete set null,
  estimated_cost numeric(14,2),
  actual_cost numeric(14,2),
  vat_rate numeric(5,2) not null default 15,
  vat_inclusive boolean not null default true,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  before_image_paths text[] not null default '{}'::text[],
  after_image_paths text[] not null default '{}'::text[],
  opened_by uuid references auth.users(id) on delete set null,
  last_status_changed_by uuid references auth.users(id) on delete set null,
  status_history jsonb not null default '[]'::jsonb,
  expense_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  name text not null,
  frequency text not null,
  last_performed_at date,
  next_due_date date not null,
  default_vendor_id uuid references public.vendors(id) on delete set null,
  expected_cost numeric(14,2),
  status text not null default 'active',
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendors_specialty_check') then
    alter table public.vendors
      add constraint vendors_specialty_check
      check (specialty in ('plumbing','electrical','hvac','elevators','cleaning','general'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vendors_rating_check') then
    alter table public.vendors
      add constraint vendors_rating_check
      check (rating >= 1 and rating <= 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vendors_tax_number_check') then
    alter table public.vendors
      add constraint vendors_tax_number_check
      check (tax_number is null or tax_number ~ '^[0-9]{15}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_requests_category_check') then
    alter table public.maintenance_requests
      add constraint maintenance_requests_category_check
      check (category in ('plumbing','electrical','hvac','elevators','cleaning','general'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_requests_priority_check') then
    alter table public.maintenance_requests
      add constraint maintenance_requests_priority_check
      check (priority in ('urgent','high','medium','low'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_requests_status_check') then
    alter table public.maintenance_requests
      add constraint maintenance_requests_status_check
      check (status in ('new','approved','in_progress','completed','cancelled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_requests_costs_check') then
    alter table public.maintenance_requests
      add constraint maintenance_requests_costs_check
      check (
        (estimated_cost is null or estimated_cost >= 0)
        and (actual_cost is null or actual_cost >= 0)
        and vat_rate >= 0
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_schedules_frequency_check') then
    alter table public.maintenance_schedules
      add constraint maintenance_schedules_frequency_check
      check (frequency in ('monthly','quarterly','semi_annual','annual'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_schedules_status_check') then
    alter table public.maintenance_schedules
      add constraint maintenance_schedules_status_check
      check (status in ('active','paused'));
  end if;
end $$;

create index if not exists idx_vendors_org_specialty
  on public.vendors(org_id, specialty)
  where archived_at is null;
create index if not exists idx_maintenance_requests_org_status
  on public.maintenance_requests(org_id, status, priority)
  where archived_at is null;
create index if not exists idx_maintenance_requests_property
  on public.maintenance_requests(property_id, opened_at desc)
  where archived_at is null;
create index if not exists idx_maintenance_requests_unit
  on public.maintenance_requests(unit_id)
  where unit_id is not null and archived_at is null;
create index if not exists idx_maintenance_requests_vendor
  on public.maintenance_requests(assigned_vendor_id)
  where assigned_vendor_id is not null and archived_at is null;
create index if not exists idx_maintenance_schedules_org_due
  on public.maintenance_schedules(org_id, next_due_date)
  where archived_at is null and status = 'active';
create index if not exists idx_maintenance_schedules_property
  on public.maintenance_schedules(property_id, next_due_date)
  where archived_at is null;

grant select, insert, update on public.vendors to authenticated;
grant select, insert, update on public.maintenance_requests to authenticated;
grant select, insert, update on public.maintenance_schedules to authenticated;
grant all on public.vendors to service_role;
grant all on public.maintenance_requests to service_role;
grant all on public.maintenance_schedules to service_role;

alter table public.vendors enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_schedules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_phase3_members_read') then
    create policy vendors_phase3_members_read on public.vendors
      for select to authenticated
      using (public.is_org_member(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_phase3_staff_insert') then
    create policy vendors_phase3_staff_insert on public.vendors
      for insert to authenticated
      with check (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_phase3_staff_update') then
    create policy vendors_phase3_staff_update on public.vendors
      for update to authenticated
      using (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']))
      with check (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maintenance_requests' and policyname = 'maintenance_requests_phase3_members_read') then
    create policy maintenance_requests_phase3_members_read on public.maintenance_requests
      for select to authenticated
      using (public.is_org_member(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maintenance_requests' and policyname = 'maintenance_requests_phase3_staff_insert') then
    create policy maintenance_requests_phase3_staff_insert on public.maintenance_requests
      for insert to authenticated
      with check (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maintenance_requests' and policyname = 'maintenance_requests_phase3_staff_update') then
    create policy maintenance_requests_phase3_staff_update on public.maintenance_requests
      for update to authenticated
      using (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']))
      with check (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maintenance_schedules' and policyname = 'maintenance_schedules_phase3_members_read') then
    create policy maintenance_schedules_phase3_members_read on public.maintenance_schedules
      for select to authenticated
      using (public.is_org_member(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maintenance_schedules' and policyname = 'maintenance_schedules_phase3_staff_insert') then
    create policy maintenance_schedules_phase3_staff_insert on public.maintenance_schedules
      for insert to authenticated
      with check (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maintenance_schedules' and policyname = 'maintenance_schedules_phase3_staff_update') then
    create policy maintenance_schedules_phase3_staff_update on public.maintenance_schedules
      for update to authenticated
      using (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']))
      with check (public.hbspro_has_org_role_text(org_id, auth.uid(), array['owner','admin','finance_manager','maintenance_supervisor']));
  end if;
end $$;

alter table public.expenses add column if not exists unit_id uuid references public.units(id) on delete set null;
alter table public.expenses add column if not exists vendor_id uuid references public.vendors(id) on delete set null;
alter table public.expenses add column if not exists source text;
alter table public.expenses add column if not exists source_id uuid;
alter table public.expenses add column if not exists vat_rate numeric(5,2) not null default 0;
alter table public.expenses add column if not exists vat_inclusive boolean not null default false;

create index if not exists idx_expenses_source
  on public.expenses(org_id, source, source_id)
  where source is not null;
create index if not exists idx_expenses_unit
  on public.expenses(unit_id)
  where unit_id is not null;
create index if not exists idx_expenses_vendor
  on public.expenses(vendor_id)
  where vendor_id is not null;
create unique index if not exists idx_expenses_maintenance_source_unique
  on public.expenses(source_id)
  where source = 'maintenance';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maintenance_requests_expense_id_fkey') then
    alter table public.maintenance_requests
      add constraint maintenance_requests_expense_id_fkey
      foreign key (expense_id) references public.expenses(id) on delete set null;
  end if;
end $$;

create or replace view public.maintenance_requests_accessible
with (security_invoker = true)
as
select
  r.id,
  r.org_id,
  r.property_id,
  r.unit_id,
  r.title,
  r.description,
  r.category,
  r.priority,
  r.status,
  r.assigned_vendor_id,
  case
    when public.hbspro_has_org_role_text(r.org_id, auth.uid(), array['owner','admin','finance_manager','accountant','maintenance_supervisor'])
      then r.estimated_cost
    else null
  end as estimated_cost,
  case
    when public.hbspro_has_org_role_text(r.org_id, auth.uid(), array['owner','admin','finance_manager','accountant','maintenance_supervisor'])
      then r.actual_cost
    else null
  end as actual_cost,
  case
    when public.hbspro_has_org_role_text(r.org_id, auth.uid(), array['owner','admin','finance_manager','accountant','maintenance_supervisor'])
      then r.vat_rate
    else null
  end as vat_rate,
  case
    when public.hbspro_has_org_role_text(r.org_id, auth.uid(), array['owner','admin','finance_manager','accountant','maintenance_supervisor'])
      then r.vat_inclusive
    else null
  end as vat_inclusive,
  r.opened_at,
  r.closed_at,
  r.before_image_paths,
  r.after_image_paths,
  r.opened_by,
  r.last_status_changed_by,
  r.status_history,
  case
    when public.hbspro_has_org_role_text(r.org_id, auth.uid(), array['owner','admin','finance_manager','accountant'])
      then r.expense_id
    else null
  end as expense_id,
  r.archived_at,
  r.created_at,
  r.updated_at
from public.maintenance_requests r
where public.is_org_member(r.org_id, auth.uid());

grant select on public.maintenance_requests_accessible to authenticated;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'maintenance-images',
      'maintenance-images',
      false,
      10485760,
      array['image/png', 'image/jpeg', 'image/webp']
    )
    on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'maintenance_images_select_for_org_members'
    ) then
      create policy maintenance_images_select_for_org_members
        on storage.objects
        for select
        using (
          bucket_id = 'maintenance-images'
          and public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'maintenance_images_insert_for_maintenance_staff'
    ) then
      create policy maintenance_images_insert_for_maintenance_staff
        on storage.objects
        for insert
        with check (
          bucket_id = 'maintenance-images'
          and public.hbspro_has_org_role_text(
            (storage.foldername(name))[1]::uuid,
            auth.uid(),
            array['owner','admin','finance_manager','maintenance_supervisor']
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'maintenance_images_update_for_maintenance_staff'
    ) then
      create policy maintenance_images_update_for_maintenance_staff
        on storage.objects
        for update
        using (
          bucket_id = 'maintenance-images'
          and public.hbspro_has_org_role_text(
            (storage.foldername(name))[1]::uuid,
            auth.uid(),
            array['owner','admin','finance_manager','maintenance_supervisor']
          )
        )
        with check (
          bucket_id = 'maintenance-images'
          and public.hbspro_has_org_role_text(
            (storage.foldername(name))[1]::uuid,
            auth.uid(),
            array['owner','admin','finance_manager','maintenance_supervisor']
          )
        );
    end if;
  end if;
end $$;

create or replace function public.hbspro_next_maintenance_due_date(
  _from date,
  _frequency text
)
returns date
language sql
immutable
as $$
  select case _frequency
    when 'monthly' then (_from + interval '1 month')::date
    when 'quarterly' then (_from + interval '3 months')::date
    when 'semi_annual' then (_from + interval '6 months')::date
    when 'annual' then (_from + interval '1 year')::date
    else _from
  end;
$$;

grant execute on function public.hbspro_next_maintenance_due_date(date, text) to authenticated, service_role;

create or replace function public.hbspro_mark_maintenance_schedule_done(
  _schedule_id uuid,
  _performed_at date default current_date
)
returns public.maintenance_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.maintenance_schedules;
begin
  select *
    into v_schedule
    from public.maintenance_schedules
   where id = _schedule_id
     and archived_at is null;

  if not found then
    raise exception 'Maintenance schedule not found';
  end if;

  if not public.hbspro_has_org_role_text(
    v_schedule.org_id,
    auth.uid(),
    array['owner','admin','finance_manager','maintenance_supervisor']
  ) then
    raise exception 'Forbidden';
  end if;

  update public.maintenance_schedules
     set last_performed_at = _performed_at,
         next_due_date = public.hbspro_next_maintenance_due_date(_performed_at, frequency),
         updated_at = now()
   where id = _schedule_id
   returning * into v_schedule;

  return v_schedule;
end;
$$;

grant execute on function public.hbspro_mark_maintenance_schedule_done(uuid, date) to authenticated;

create or replace function public.hbspro_maintenance_request_before_save()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event jsonb;
begin
  if tg_op = 'INSERT' then
    new.opened_by := coalesce(new.opened_by, auth.uid());
    new.last_status_changed_by := coalesce(new.last_status_changed_by, auth.uid());
    new.status_history := coalesce(new.status_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', new.status,
        'changed_at', now(),
        'changed_by', new.last_status_changed_by
      )
    );
  elsif new.status is distinct from old.status then
    new.last_status_changed_by := coalesce(auth.uid(), new.last_status_changed_by);
    v_event := jsonb_build_object(
      'from', old.status,
      'status', new.status,
      'changed_at', now(),
      'changed_by', new.last_status_changed_by
    );
    new.status_history := coalesce(old.status_history, '[]'::jsonb) || jsonb_build_array(v_event);
  end if;

  if new.status in ('completed','cancelled') and new.closed_at is null then
    new.closed_at := now();
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_maintenance_request_before_save') then
    create trigger trg_hbspro_maintenance_request_before_save
      before insert or update on public.maintenance_requests
      for each row execute function public.hbspro_maintenance_request_before_save();
  end if;
end $$;

create or replace function public.hbspro_create_maintenance_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vat numeric(14,2) := 0;
  v_expense_id uuid;
  v_vendor_name text;
begin
  if new.status <> 'completed' or new.actual_cost is null or new.actual_cost <= 0 then
    return new;
  end if;

  if new.expense_id is not null then
    return new;
  end if;

  select name into v_vendor_name
    from public.vendors
   where id = new.assigned_vendor_id;

  if coalesce(new.vat_rate, 0) > 0 then
    if new.vat_inclusive then
      v_vat := round(new.actual_cost - (new.actual_cost / (1 + (new.vat_rate / 100))), 2);
    else
      v_vat := round(new.actual_cost * (new.vat_rate / 100), 2);
    end if;
  end if;

  insert into public.expenses (
    org_id,
    spent_at,
    category,
    vendor,
    description,
    amount,
    vat_amount,
    currency,
    property_id,
    unit_id,
    vendor_id,
    source,
    source_id,
    vat_rate,
    vat_inclusive,
    created_by
  )
  values (
    new.org_id,
    coalesce(new.closed_at, now())::date,
    'maintenance',
    v_vendor_name,
    new.title,
    new.actual_cost,
    v_vat,
    'SAR',
    new.property_id,
    new.unit_id,
    new.assigned_vendor_id,
    'maintenance',
    new.id,
    new.vat_rate,
    new.vat_inclusive,
    coalesce(new.last_status_changed_by, new.opened_by)
  )
  returning id into v_expense_id;

  update public.maintenance_requests
     set expense_id = v_expense_id
   where id = new.id;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_create_maintenance_expense') then
    create trigger trg_hbspro_create_maintenance_expense
      after insert or update on public.maintenance_requests
      for each row execute function public.hbspro_create_maintenance_expense();
  end if;
end $$;

create or replace function public.hbspro_notify_maintenance_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.notifications (org_id, user_id, title, body, type, link)
    select new.org_id,
           m.user_id,
           'اكتمل طلب صيانة',
           new.title,
           'maintenance_completed',
           '/dashboard/maintenance/' || new.id::text
      from public.organization_members m
     where m.org_id = new.org_id
       and m.role::text in ('owner','admin')
       and not exists (
         select 1
           from public.notifications n
          where n.org_id = new.org_id
            and n.user_id = m.user_id
            and n.type = 'maintenance_completed'
            and n.link = '/dashboard/maintenance/' || new.id::text
       );
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_notify_maintenance_completed') then
    create trigger trg_hbspro_notify_maintenance_completed
      after insert or update on public.maintenance_requests
      for each row execute function public.hbspro_notify_maintenance_completed();
  end if;
end $$;

create or replace function public.hbspro_queue_preventive_maintenance_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.notifications (org_id, user_id, title, body, type, link)
  select s.org_id,
         m.user_id,
         'صيانة وقائية قريبة الاستحقاق',
         s.name || ' مستحقة بتاريخ ' || s.next_due_date::text,
         'maintenance_schedule_due',
         '/dashboard/maintenance?schedule=' || s.id::text
    from public.maintenance_schedules s
    join public.organization_members m on m.org_id = s.org_id
   where s.status = 'active'
     and s.archived_at is null
     and s.next_due_date between current_date and current_date + 14
     and m.role::text in ('owner','admin','maintenance_supervisor')
     and not exists (
       select 1
         from public.notifications n
        where n.org_id = s.org_id
          and n.user_id = m.user_id
          and n.type = 'maintenance_schedule_due'
          and n.link = '/dashboard/maintenance?schedule=' || s.id::text
          and n.created_at > now() - interval '7 days'
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.hbspro_queue_preventive_maintenance_notifications() to authenticated, service_role;

create or replace function public.hbspro_queue_urgent_unassigned_maintenance_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.notifications (org_id, user_id, title, body, type, link)
  select r.org_id,
         m.user_id,
         'طلب صيانة عاجل دون مورد',
         r.title,
         'maintenance_urgent_unassigned',
         '/dashboard/maintenance/' || r.id::text
    from public.maintenance_requests r
    join public.organization_members m on m.org_id = r.org_id
   where r.priority = 'urgent'
     and r.status in ('new','approved')
     and r.assigned_vendor_id is null
     and r.archived_at is null
     and r.opened_at <= now() - interval '48 hours'
     and m.role::text in ('owner','admin','maintenance_supervisor')
     and not exists (
       select 1
         from public.notifications n
        where n.org_id = r.org_id
          and n.user_id = m.user_id
          and n.type = 'maintenance_urgent_unassigned'
          and n.link = '/dashboard/maintenance/' || r.id::text
          and n.created_at > now() - interval '24 hours'
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.hbspro_queue_urgent_unassigned_maintenance_notifications() to authenticated, service_role;
