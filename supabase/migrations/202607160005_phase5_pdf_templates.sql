-- AMLAK HBSH Phase 5: PDF template defaults.
-- Additive only: no destructive operations.

create table if not exists public.pdf_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_type text not null,
  template_key text not null,
  is_default boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  show_hijri_date boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint pdf_templates_document_type_check
    check (
      document_type in (
        'simplified_tax_invoice',
        'receipt_voucher',
        'payment_voucher',
        'property_performance_report',
        'tenant_statement',
        'personal_expense_statement',
        'maintenance_report'
      )
    ),
  constraint pdf_templates_template_key_check
    check (template_key in ('official', 'modern', 'luxury', 'simple')),
  constraint pdf_templates_unique_template unique (org_id, document_type, template_key)
);

create unique index if not exists pdf_templates_one_default_per_document_idx
  on public.pdf_templates (org_id, document_type)
  where is_default;

create index if not exists pdf_templates_org_document_idx
  on public.pdf_templates (org_id, document_type);

alter table public.pdf_templates enable row level security;

grant select, insert, update on public.pdf_templates to authenticated;
grant all on public.pdf_templates to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pdf_templates'
      and policyname = 'pdf_templates_org_members_read'
  ) then
    create policy pdf_templates_org_members_read on public.pdf_templates
      for select to authenticated
      using (public.is_org_member(org_id, auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pdf_templates'
      and policyname = 'pdf_templates_finance_write'
  ) then
    create policy pdf_templates_finance_write on public.pdf_templates
      for insert to authenticated
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pdf_templates'
      and policyname = 'pdf_templates_finance_update'
  ) then
    create policy pdf_templates_finance_update on public.pdf_templates
      for update to authenticated
      using (public.hbspro_finance_can_write(org_id, auth.uid()))
      with check (public.hbspro_finance_can_write(org_id, auth.uid()));
  end if;
end $$;
