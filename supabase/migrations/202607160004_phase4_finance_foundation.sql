-- AMLAK HBSH Phase 4: finance foundation.
-- Additive only: no destructive schema or data operations.

create table if not exists public.lease_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  due_date date not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'due',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lease_payments add column if not exists paid_amount numeric(14,2) not null default 0;
alter table public.lease_payments add column if not exists paid_at timestamptz;
alter table public.lease_payments add column if not exists payment_method text;
alter table public.lease_payments add column if not exists receipt_number text;
alter table public.lease_payments add column if not exists notes text;
alter table public.lease_payments add column if not exists waived_at timestamptz;
alter table public.lease_payments add column if not exists overdue_marked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lease_payments_status_check') then
    alter table public.lease_payments
      add constraint lease_payments_status_check
      check (status in ('due','paid','partial','overdue','waived'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lease_payments_payment_method_check') then
    alter table public.lease_payments
      add constraint lease_payments_payment_method_check
      check (payment_method is null or payment_method in ('cash','bank_transfer','cheque','mada','other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lease_payments_paid_amount_check') then
    alter table public.lease_payments
      add constraint lease_payments_paid_amount_check
      check (paid_amount >= 0);
  end if;
end $$;

create table if not exists public.finance_sequences (
  org_id uuid not null references public.organizations(id) on delete restrict,
  sequence_key text not null,
  last_number bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, sequence_key)
);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  lease_payment_id uuid not null references public.lease_payments(id) on delete restrict,
  amount numeric(14,2) not null,
  payment_method text not null,
  paid_at timestamptz not null default now(),
  receipt_number text not null,
  type text not null default 'payment',
  reverses_receipt_id uuid references public.payment_receipts(id) on delete restrict,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, receipt_number)
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  scope text not null,
  name_ar text not null,
  name_en text not null,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  category_id uuid references public.expense_categories(id) on delete restrict,
  scope text not null default 'property',
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  amount numeric(14,2) not null,
  vat_mode text not null default 'inclusive',
  vat_rate numeric(5,2) not null default 15,
  frequency text not null,
  generation_day int not null default 1,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active',
  last_generated_on date,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  scope text not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  monthly_amount numeric(14,2) not null,
  alert_80_sent_at timestamptz,
  alert_exceeded_sent_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses add column if not exists scope text not null default 'property';
alter table public.expenses add column if not exists payment_method text;
alter table public.expenses add column if not exists receipt_path text;
alter table public.expenses add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;
alter table public.expenses add column if not exists vat_mode text not null default 'inclusive';
alter table public.expenses alter column vat_rate set default 15;
alter table public.expenses add column if not exists net_amount numeric(14,2);
alter table public.expenses add column if not exists gross_amount numeric(14,2);
alter table public.expenses add column if not exists finance_status text not null default 'confirmed';
alter table public.expenses add column if not exists archived_at timestamptz;
alter table public.expenses add column if not exists category_id uuid references public.expense_categories(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_receipts_amount_check') then
    alter table public.payment_receipts
      add constraint payment_receipts_amount_check
      check (amount > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payment_receipts_type_check') then
    alter table public.payment_receipts
      add constraint payment_receipts_type_check
      check (type in ('payment','reversal'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payment_receipts_payment_method_check') then
    alter table public.payment_receipts
      add constraint payment_receipts_payment_method_check
      check (payment_method in ('cash','bank_transfer','cheque','mada','other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expense_categories_scope_check') then
    alter table public.expense_categories
      add constraint expense_categories_scope_check
      check (scope in ('property','personal'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'recurring_expenses_scope_check') then
    alter table public.recurring_expenses
      add constraint recurring_expenses_scope_check
      check (scope in ('property','personal'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'recurring_expenses_vat_mode_check') then
    alter table public.recurring_expenses
      add constraint recurring_expenses_vat_mode_check
      check (vat_mode in ('inclusive','exclusive','exempt'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'recurring_expenses_frequency_check') then
    alter table public.recurring_expenses
      add constraint recurring_expenses_frequency_check
      check (frequency in ('monthly','quarterly','annual'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'recurring_expenses_status_check') then
    alter table public.recurring_expenses
      add constraint recurring_expenses_status_check
      check (status in ('active','paused'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'recurring_expenses_generation_day_check') then
    alter table public.recurring_expenses
      add constraint recurring_expenses_generation_day_check
      check (generation_day between 1 and 28);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_scope_check') then
    alter table public.budgets
      add constraint budgets_scope_check
      check (scope in ('personal','category','property'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_amount_check') then
    alter table public.budgets
      add constraint budgets_amount_check
      check (monthly_amount > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_scope_check') then
    alter table public.expenses
      add constraint expenses_scope_check
      check (scope in ('property','personal'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_vat_mode_check') then
    alter table public.expenses
      add constraint expenses_vat_mode_check
      check (vat_mode in ('inclusive','exclusive','exempt'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_source_check') then
    alter table public.expenses
      add constraint expenses_source_check
      check (source is null or source in ('manual','maintenance','recurring'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_finance_status_check') then
    alter table public.expenses
      add constraint expenses_finance_status_check
      check (finance_status in ('pending_confirmation','confirmed','reversed','voided'));
  end if;
end $$;

create index if not exists idx_lease_payments_org_due on public.lease_payments(org_id, due_date);
create index if not exists idx_lease_payments_org_status on public.lease_payments(org_id, status);
create index if not exists idx_payment_receipts_org_created on public.payment_receipts(org_id, created_at desc);
create index if not exists idx_payment_receipts_lease_payment on public.payment_receipts(lease_payment_id);
create index if not exists idx_expense_categories_org_scope on public.expense_categories(org_id, scope) where archived_at is null;
create unique index if not exists idx_expense_categories_org_scope_name_active
  on public.expense_categories(org_id, scope, name_en)
  where archived_at is null;
create index if not exists idx_recurring_expenses_org_status on public.recurring_expenses(org_id, status) where archived_at is null;
create index if not exists idx_budgets_org_scope on public.budgets(org_id, scope) where archived_at is null;
create index if not exists idx_expenses_phase4_scope on public.expenses(org_id, scope, spent_at desc) where archived_at is null;
create index if not exists idx_expenses_phase4_category on public.expenses(category_id) where category_id is not null and archived_at is null;
create index if not exists idx_expenses_phase4_recurring on public.expenses(recurring_id) where recurring_id is not null;

create or replace function public.hbspro_finance_can_manage(_org uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hbspro_has_org_role_text(_org, _user, array['owner','admin','finance_manager']);
$$;

create or replace function public.hbspro_finance_can_write(_org uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hbspro_has_org_role_text(_org, _user, array['owner','admin','finance_manager','accountant']);
$$;

create or replace function public.hbspro_finance_can_read(_org uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hbspro_has_org_role_text(_org, _user, array['owner','admin','finance_manager','accountant','viewer']);
$$;

grant execute on function public.hbspro_finance_can_manage(uuid, uuid) to authenticated, service_role;
grant execute on function public.hbspro_finance_can_write(uuid, uuid) to authenticated, service_role;
grant execute on function public.hbspro_finance_can_read(uuid, uuid) to authenticated, service_role;

create or replace function public.hbspro_next_finance_number(_org uuid, _key text, _prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if auth.uid() is not null and not public.hbspro_finance_can_write(_org, auth.uid()) then
    raise exception 'Forbidden';
  end if;

  insert into public.finance_sequences (org_id, sequence_key, last_number)
  values (_org, _key, 1)
  on conflict (org_id, sequence_key)
  do update set last_number = public.finance_sequences.last_number + 1,
                updated_at = now()
  returning last_number into v_next;

  return _prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_next::text, 6, '0');
end;
$$;

grant execute on function public.hbspro_next_finance_number(uuid, text, text) to authenticated, service_role;

create or replace function public.hbspro_calculate_vat(
  _amount numeric,
  _vat_mode text,
  _vat_rate numeric default 15
)
returns table(net_amount numeric, vat_amount numeric, gross_amount numeric)
language sql
immutable
as $$
  select
    case
      when _vat_mode = 'inclusive' then round(coalesce(_amount, 0) / (1 + (coalesce(_vat_rate, 0) / 100)), 2)
      else round(coalesce(_amount, 0), 2)
    end as net_amount,
    case
      when _vat_mode = 'exempt' then 0::numeric
      when _vat_mode = 'inclusive' then round(coalesce(_amount, 0) - (coalesce(_amount, 0) / (1 + (coalesce(_vat_rate, 0) / 100))), 2)
      else round(coalesce(_amount, 0) * (coalesce(_vat_rate, 0) / 100), 2)
    end as vat_amount,
    case
      when _vat_mode = 'exclusive' then round(coalesce(_amount, 0) * (1 + (coalesce(_vat_rate, 0) / 100)), 2)
      else round(coalesce(_amount, 0), 2)
    end as gross_amount;
$$;

grant execute on function public.hbspro_calculate_vat(numeric, text, numeric) to authenticated, service_role;

create or replace function public.hbspro_expenses_before_save()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_calc record;
begin
  if new.category_id is not null and not exists (
    select 1 from public.expense_categories c
    where c.id = new.category_id
      and c.org_id = new.org_id
      and c.archived_at is null
  ) then
    raise exception 'Expense category must belong to the same organization';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = new.property_id
      and p.org_id = new.org_id
  ) then
    raise exception 'Expense property must belong to the same organization';
  end if;

  if new.unit_id is not null and not exists (
    select 1 from public.units u
    where u.id = new.unit_id
      and u.org_id = new.org_id
      and (new.property_id is null or u.property_id = new.property_id)
  ) then
    raise exception 'Expense unit must belong to the same organization and property';
  end if;

  if new.vendor_id is not null and not exists (
    select 1 from public.vendors v
    where v.id = new.vendor_id
      and v.org_id = new.org_id
  ) then
    raise exception 'Expense vendor must belong to the same organization';
  end if;

  if new.recurring_id is not null and not exists (
    select 1 from public.recurring_expenses r
    where r.id = new.recurring_id
      and r.org_id = new.org_id
      and r.archived_at is null
  ) then
    raise exception 'Recurring expense source must belong to the same organization';
  end if;

  select * into v_calc
  from public.hbspro_calculate_vat(
    coalesce(new.gross_amount, new.amount, 0),
    coalesce(new.vat_mode, 'inclusive'),
    coalesce(new.vat_rate, 15)
  );

  new.net_amount := v_calc.net_amount;
  new.vat_amount := v_calc.vat_amount;
  new.gross_amount := v_calc.gross_amount;
  new.amount := v_calc.gross_amount;
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_expenses_before_save') then
    create trigger trg_hbspro_expenses_before_save
      before insert or update on public.expenses
      for each row execute function public.hbspro_expenses_before_save();
  end if;
end $$;

create or replace function public.hbspro_lease_payments_before_save()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.contract_id is not null and not exists (
    select 1 from public.contracts c
    where c.id = new.contract_id
      and c.org_id = new.org_id
  ) then
    raise exception 'Lease payment contract must belong to the same organization';
  end if;

  if new.tenant_id is not null and not exists (
    select 1 from public.tenants t
    where t.id = new.tenant_id
      and t.org_id = new.org_id
  ) then
    raise exception 'Lease payment tenant must belong to the same organization';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = new.property_id
      and p.org_id = new.org_id
  ) then
    raise exception 'Lease payment property must belong to the same organization';
  end if;

  if new.unit_id is not null and not exists (
    select 1 from public.units u
    where u.id = new.unit_id
      and u.org_id = new.org_id
      and (new.property_id is null or u.property_id = new.property_id)
  ) then
    raise exception 'Lease payment unit must belong to the same organization and property';
  end if;

  if new.waived_at is not null then
    new.status := 'waived';
  elsif coalesce(new.paid_amount, 0) >= coalesce(new.amount, 0) and coalesce(new.amount, 0) > 0 then
    new.status := 'paid';
  elsif coalesce(new.paid_amount, 0) > 0 then
    new.status := 'partial';
  elsif new.due_date < current_date then
    new.status := 'overdue';
    new.overdue_marked_at := coalesce(new.overdue_marked_at, now());
  else
    new.status := 'due';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_lease_payments_before_save') then
    create trigger trg_hbspro_lease_payments_before_save
      before insert or update on public.lease_payments
      for each row execute function public.hbspro_lease_payments_before_save();
  end if;
end $$;

create or replace function public.hbspro_recurring_expenses_before_save()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.expense_categories c
    where c.id = new.category_id
      and c.org_id = new.org_id
      and c.scope = new.scope
      and c.archived_at is null
  ) then
    raise exception 'Recurring expense category must belong to the same organization and scope';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = new.property_id
      and p.org_id = new.org_id
  ) then
    raise exception 'Recurring expense property must belong to the same organization';
  end if;

  if new.unit_id is not null and not exists (
    select 1 from public.units u
    where u.id = new.unit_id
      and u.org_id = new.org_id
      and (new.property_id is null or u.property_id = new.property_id)
  ) then
    raise exception 'Recurring expense unit must belong to the same organization and property';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_recurring_expenses_before_save') then
    create trigger trg_hbspro_recurring_expenses_before_save
      before insert or update on public.recurring_expenses
      for each row execute function public.hbspro_recurring_expenses_before_save();
  end if;
end $$;

create or replace function public.hbspro_budgets_before_save()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.expense_categories c
    where c.id = new.category_id
      and c.org_id = new.org_id
      and c.archived_at is null
  ) then
    raise exception 'Budget category must belong to the same organization';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = new.property_id
      and p.org_id = new.org_id
  ) then
    raise exception 'Budget property must belong to the same organization';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_budgets_before_save') then
    create trigger trg_hbspro_budgets_before_save
      before insert or update on public.budgets
      for each row execute function public.hbspro_budgets_before_save();
  end if;
end $$;

create or replace function public.hbspro_record_lease_payment(
  _lease_payment_id uuid,
  _amount numeric,
  _payment_method text,
  _paid_at timestamptz default now(),
  _notes text default null
)
returns public.payment_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.lease_payments;
  v_receipt public.payment_receipts;
  v_number text;
begin
  select * into v_payment
    from public.lease_payments
   where id = _lease_payment_id;

  if not found then
    raise exception 'Lease payment not found';
  end if;

  if not public.hbspro_finance_can_write(v_payment.org_id, auth.uid()) then
    raise exception 'Forbidden';
  end if;

  if _amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  v_number := public.hbspro_next_finance_number(v_payment.org_id, 'receipt', 'RCPT');

  insert into public.payment_receipts (
    org_id,
    lease_payment_id,
    amount,
    payment_method,
    paid_at,
    receipt_number,
    type,
    notes,
    created_by
  )
  values (
    v_payment.org_id,
    _lease_payment_id,
    _amount,
    _payment_method,
    coalesce(_paid_at, now()),
    v_number,
    'payment',
    _notes,
    auth.uid()
  )
  returning * into v_receipt;

  update public.lease_payments
     set paid_amount = coalesce(paid_amount, 0) + _amount,
         paid_at = coalesce(_paid_at, now()),
         payment_method = _payment_method,
         receipt_number = v_number
   where id = _lease_payment_id;

  return v_receipt;
end;
$$;

grant execute on function public.hbspro_record_lease_payment(uuid, numeric, text, timestamptz, text) to authenticated;

create or replace function public.hbspro_reverse_payment_receipt(
  _receipt_id uuid,
  _notes text default null
)
returns public.payment_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.payment_receipts;
  v_reversal public.payment_receipts;
  v_number text;
begin
  select * into v_original
    from public.payment_receipts
   where id = _receipt_id;

  if not found then
    raise exception 'Receipt not found';
  end if;

  if v_original.type = 'reversal' then
    raise exception 'Reversal receipts cannot be reversed';
  end if;

  if not public.hbspro_finance_can_write(v_original.org_id, auth.uid()) then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1 from public.payment_receipts
     where reverses_receipt_id = _receipt_id
  ) then
    raise exception 'Receipt already reversed';
  end if;

  v_number := public.hbspro_next_finance_number(v_original.org_id, 'receipt', 'RCPT');

  insert into public.payment_receipts (
    org_id,
    lease_payment_id,
    amount,
    payment_method,
    paid_at,
    receipt_number,
    type,
    reverses_receipt_id,
    notes,
    created_by
  )
  values (
    v_original.org_id,
    v_original.lease_payment_id,
    v_original.amount,
    v_original.payment_method,
    now(),
    v_number,
    'reversal',
    v_original.id,
    _notes,
    auth.uid()
  )
  returning * into v_reversal;

  update public.lease_payments
     set paid_amount = greatest(coalesce(paid_amount, 0) - v_original.amount, 0)
   where id = v_original.lease_payment_id;

  return v_reversal;
end;
$$;

grant execute on function public.hbspro_reverse_payment_receipt(uuid, text) to authenticated;

create or replace function public.hbspro_seed_default_expense_categories(_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.expense_categories (org_id, scope, name_ar, name_en, is_default)
  values
    (_org, 'property', 'كهرباء', 'Electricity', true),
    (_org, 'property', 'ماء', 'Water', true),
    (_org, 'property', 'رسوم بلدية', 'Municipality fees', true),
    (_org, 'property', 'تأمين', 'Insurance', true),
    (_org, 'property', 'صيانة', 'Maintenance', true),
    (_org, 'property', 'عمولة إدارة', 'Management commission', true),
    (_org, 'property', 'أخرى', 'Other', true),
    (_org, 'personal', 'سكن', 'Housing', true),
    (_org, 'personal', 'سيارة', 'Car', true),
    (_org, 'personal', 'تعليم', 'Education', true),
    (_org, 'personal', 'صحة', 'Health', true),
    (_org, 'personal', 'تسوق', 'Shopping', true),
    (_org, 'personal', 'اشتراكات', 'Subscriptions', true),
    (_org, 'personal', 'أخرى', 'Other', true)
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.hbspro_seed_default_expense_categories(uuid) to authenticated, service_role;

create or replace function public.hbspro_seed_default_expense_categories_for_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.hbspro_seed_default_expense_categories(new.id);
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hbspro_seed_default_expense_categories_for_org') then
    create trigger trg_hbspro_seed_default_expense_categories_for_org
      after insert on public.organizations
      for each row execute function public.hbspro_seed_default_expense_categories_for_org();
  end if;
end $$;

select public.hbspro_seed_default_expense_categories(id)
  from public.organizations;

alter table public.lease_payments enable row level security;
alter table public.finance_sequences enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.expense_categories enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.budgets enable row level security;

grant select, insert, update on public.lease_payments to authenticated;
grant select on public.payment_receipts to authenticated;
grant insert on public.payment_receipts to authenticated;
grant select, insert, update on public.expense_categories to authenticated;
grant select, insert, update on public.recurring_expenses to authenticated;
grant select, insert, update on public.budgets to authenticated;
grant select, insert, update on public.finance_sequences to service_role;
grant all on public.lease_payments to service_role;
grant all on public.payment_receipts to service_role;
grant all on public.expense_categories to service_role;
grant all on public.recurring_expenses to service_role;
grant all on public.budgets to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lease_payments' and policyname = 'lease_payments_finance_read') then
    create policy lease_payments_finance_read on public.lease_payments
      for select to authenticated
      using (public.hbspro_finance_can_read(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lease_payments' and policyname = 'lease_payments_finance_insert') then
    create policy lease_payments_finance_insert on public.lease_payments
      for insert to authenticated
      with check (public.hbspro_finance_can_manage(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lease_payments' and policyname = 'lease_payments_finance_update') then
    create policy lease_payments_finance_update on public.lease_payments
      for update to authenticated
      using (public.hbspro_finance_can_write(org_id, auth.uid()))
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_receipts' and policyname = 'payment_receipts_finance_read') then
    create policy payment_receipts_finance_read on public.payment_receipts
      for select to authenticated
      using (public.hbspro_finance_can_read(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_receipts' and policyname = 'payment_receipts_finance_insert') then
    create policy payment_receipts_finance_insert on public.payment_receipts
      for insert to authenticated
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expense_categories' and policyname = 'expense_categories_finance_read') then
    create policy expense_categories_finance_read on public.expense_categories
      for select to authenticated
      using (public.is_org_member(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expense_categories' and policyname = 'expense_categories_finance_insert') then
    create policy expense_categories_finance_insert on public.expense_categories
      for insert to authenticated
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expense_categories' and policyname = 'expense_categories_finance_update') then
    create policy expense_categories_finance_update on public.expense_categories
      for update to authenticated
      using (public.hbspro_finance_can_write(org_id, auth.uid()))
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recurring_expenses' and policyname = 'recurring_expenses_finance_read') then
    create policy recurring_expenses_finance_read on public.recurring_expenses
      for select to authenticated
      using (public.hbspro_finance_can_read(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recurring_expenses' and policyname = 'recurring_expenses_finance_insert') then
    create policy recurring_expenses_finance_insert on public.recurring_expenses
      for insert to authenticated
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recurring_expenses' and policyname = 'recurring_expenses_finance_update') then
    create policy recurring_expenses_finance_update on public.recurring_expenses
      for update to authenticated
      using (public.hbspro_finance_can_write(org_id, auth.uid()))
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budgets' and policyname = 'budgets_finance_read') then
    create policy budgets_finance_read on public.budgets
      for select to authenticated
      using (public.hbspro_finance_can_read(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budgets' and policyname = 'budgets_finance_insert') then
    create policy budgets_finance_insert on public.budgets
      for insert to authenticated
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budgets' and policyname = 'budgets_finance_update') then
    create policy budgets_finance_update on public.budgets
      for update to authenticated
      using (public.hbspro_finance_can_write(org_id, auth.uid()))
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'expense-receipts',
      'expense-receipts',
      false,
      10485760,
      array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
    )
    on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'expense_receipts_select_for_finance'
    ) then
      create policy expense_receipts_select_for_finance
        on storage.objects
        for select
        using (
          bucket_id = 'expense-receipts'
          and public.hbspro_finance_can_read((storage.foldername(name))[1]::uuid, auth.uid())
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'expense_receipts_insert_for_finance'
    ) then
      create policy expense_receipts_insert_for_finance
        on storage.objects
        for insert
        with check (
          bucket_id = 'expense-receipts'
          and public.hbspro_finance_can_write((storage.foldername(name))[1]::uuid, auth.uid())
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'expense_receipts_update_for_finance'
    ) then
      create policy expense_receipts_update_for_finance
        on storage.objects
        for update
        using (
          bucket_id = 'expense-receipts'
          and public.hbspro_finance_can_write((storage.foldername(name))[1]::uuid, auth.uid())
        )
        with check (
          bucket_id = 'expense-receipts'
          and public.hbspro_finance_can_write((storage.foldername(name))[1]::uuid, auth.uid())
        );
    end if;
  end if;
end $$;
