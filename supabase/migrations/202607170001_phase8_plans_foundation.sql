-- Phase 8: Plans foundation and account limits
-- Safe/idempotent migration. No destructive operations.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  monthly_price numeric(10,2) not null default 0,
  yearly_price numeric(10,2),
  vat_inclusive boolean not null default true,
  property_limit integer,
  unit_limit integer,
  user_limit integer,
  pdf_template_limit integer,
  export_limit_monthly integer,
  unlimited_units boolean not null default false,
  unlimited_properties boolean not null default false,
  unlimited_exports boolean not null default false,
  includes_all_pdf_templates boolean not null default false,
  includes_budgets boolean not null default false,
  includes_recurring_expenses boolean not null default false,
  includes_tax_summary boolean not null default false,
  priority_support boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts
  add column if not exists plan_id uuid references public.plans(id),
  add column if not exists plan_expires_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

alter table public.plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'plans' and policyname = 'Anyone can view active plans'
  ) then
    create policy "Anyone can view active plans"
      on public.plans
      for select
      using (is_active = true);
  end if;
end $$;

insert into public.plans (
  code,
  name_ar,
  name_en,
  monthly_price,
  yearly_price,
  vat_inclusive,
  property_limit,
  unit_limit,
  user_limit,
  pdf_template_limit,
  export_limit_monthly,
  unlimited_units,
  unlimited_properties,
  unlimited_exports,
  includes_all_pdf_templates,
  includes_budgets,
  includes_recurring_expenses,
  includes_tax_summary,
  priority_support,
  sort_order
) values
  ('free', 'مجاني', 'Free', 0, null, true, 1, 5, 1, 1, 10, false, false, false, false, false, false, false, false, 10),
  ('pro_individual', 'برو للأفراد', 'Pro Individual', 49, 490, true, 10, null, 1, 4, null, true, false, true, true, true, true, false, false, 20),
  ('business', 'منشآت', 'Business', 149, 1490, true, null, null, 10, 4, null, true, true, true, true, true, true, true, true, 30)
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  vat_inclusive = excluded.vat_inclusive,
  property_limit = excluded.property_limit,
  unit_limit = excluded.unit_limit,
  user_limit = excluded.user_limit,
  pdf_template_limit = excluded.pdf_template_limit,
  export_limit_monthly = excluded.export_limit_monthly,
  unlimited_units = excluded.unlimited_units,
  unlimited_properties = excluded.unlimited_properties,
  unlimited_exports = excluded.unlimited_exports,
  includes_all_pdf_templates = excluded.includes_all_pdf_templates,
  includes_budgets = excluded.includes_budgets,
  includes_recurring_expenses = excluded.includes_recurring_expenses,
  includes_tax_summary = excluded.includes_tax_summary,
  priority_support = excluded.priority_support,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.accounts a
set
  plan_id = p.id,
  trial_ends_at = coalesce(a.trial_ends_at, now() + interval '14 days')
from public.plans p
where p.code = 'free'
  and a.plan_id is null;

create index if not exists plans_code_idx on public.plans (code);
create index if not exists accounts_plan_id_idx on public.accounts (plan_id);
