
-- Enums
create type public.app_role as enum ('employee','manager','finance','admin');
create type public.expense_status as enum ('draft','submitted','approved','rejected','reimbursed');
create type public.report_type as enum ('trip','project','general');
create type public.report_status as enum ('draft','submitted','approved','rejected','reimbursed');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  department text,
  avatar_url text,
  manager_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles (separate table, never on profiles)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.has_any_role(_user_id uuid, _roles app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = any(_roles));
$$;

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  default_limit numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.categories (name, icon, sort_order) values
  ('Meals','utensils',1),
  ('Travel','plane',2),
  ('Lodging','bed',3),
  ('Transport','car',4),
  ('Office','briefcase',5),
  ('Software','laptop',6),
  ('Entertainment','sparkles',7),
  ('Other','dot',99);

-- Expense reports (bundles)
create table public.expense_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  type report_type not null default 'general',
  status report_status not null default 'draft',
  submitted_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.expense_reports(id) on delete set null,
  category_id uuid references public.categories(id),
  amount numeric not null,
  currency text not null default 'USD',
  merchant text,
  expense_date date not null default current_date,
  notes text,
  receipt_path text,
  status expense_status not null default 'draft',
  ocr_raw jsonb,
  policy_flags jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_notes text,
  reimbursed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.expenses(user_id);
create index on public.expenses(status);
create index on public.expenses(report_id);

-- Policies
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  rule_json jsonb not null,
  severity text not null default 'warning',
  ai_generated boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.policy_violations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete set null,
  policy_name text not null,
  severity text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index on public.policy_violations(expense_id);

-- Comments
create table public.expense_comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Audit log
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  actor uuid references auth.users(id),
  action text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);

-- Saved reports
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  spec_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.set_updated_at();
create trigger trg_reports_updated before update on public.expense_reports
  for each row execute function public.set_updated_at();
create trigger trg_policies_updated before update on public.policies
  for each row execute function public.set_updated_at();
create trigger trg_savedrep_updated before update on public.saved_reports
  for each row execute function public.set_updated_at();

-- New user trigger -> profile + employee role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.raw_user_meta_data->>'avatar_url');
  insert into public.user_roles (user_id, role) values (new.id, 'employee');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.expense_reports enable row level security;
alter table public.expenses enable row level security;
alter table public.policies enable row level security;
alter table public.policy_violations enable row level security;
alter table public.expense_comments enable row level security;
alter table public.audit_log enable row level security;
alter table public.saved_reports enable row level security;

-- profiles
create policy "profiles self read" on public.profiles for select to authenticated
  using (auth.uid() = id or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]));
create policy "profiles self update" on public.profiles for update to authenticated
  using (auth.uid() = id);
create policy "profiles self insert" on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- user_roles
create policy "roles self read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "roles admin manage" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- categories
create policy "categories read" on public.categories for select to authenticated using (true);
create policy "categories admin manage" on public.categories for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- expense_reports
create policy "reports own read" on public.expense_reports for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]));
create policy "reports own write" on public.expense_reports for insert to authenticated
  with check (user_id = auth.uid());
create policy "reports own update" on public.expense_reports for update to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]));
create policy "reports own delete" on public.expense_reports for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

-- expenses
create policy "expenses own read" on public.expenses for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]));
create policy "expenses own insert" on public.expenses for insert to authenticated
  with check (user_id = auth.uid());
create policy "expenses own/staff update" on public.expenses for update to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]));
create policy "expenses own delete" on public.expenses for delete to authenticated
  using (user_id = auth.uid() and status in ('draft','rejected'));

-- policies
create policy "policies read" on public.policies for select to authenticated using (true);
create policy "policies admin manage" on public.policies for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','finance']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','finance']::app_role[]));

-- policy_violations
create policy "violations read" on public.policy_violations for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id
    and (e.user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]))));
create policy "violations system insert" on public.policy_violations for insert to authenticated with check (true);
create policy "violations system delete" on public.policy_violations for delete to authenticated using (true);

-- comments
create policy "comments read" on public.expense_comments for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id
    and (e.user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]))));
create policy "comments insert" on public.expense_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.expenses e where e.id = expense_id
    and (e.user_id = auth.uid() or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]))));

-- audit log (read by staff)
create policy "audit staff read" on public.audit_log for select to authenticated
  using (public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[]));
create policy "audit insert" on public.audit_log for insert to authenticated with check (true);

-- saved reports
create policy "saved own all" on public.saved_reports for all to authenticated
  using (owner_id = auth.uid() or public.has_any_role(auth.uid(), array['finance','admin']::app_role[]))
  with check (owner_id = auth.uid());

-- Storage bucket for receipts
insert into storage.buckets (id, name, public) values ('receipts','receipts', false)
  on conflict (id) do nothing;

create policy "receipts user upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts user read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(auth.uid(), array['manager','finance','admin']::app_role[])));
create policy "receipts user delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Seed a couple of starter policies
insert into public.policies (name, description, rule_json, severity, ai_generated) values
  ('Meals cap $75/person', 'Flag meals exceeding $75 per person', '{"type":"category_amount_max","category":"Meals","max":75}'::jsonb, 'warning', false),
  ('Receipt required >$25', 'Flag any expense over $25 without an attached receipt', '{"type":"receipt_required_above","amount":25}'::jsonb, 'error', false);
