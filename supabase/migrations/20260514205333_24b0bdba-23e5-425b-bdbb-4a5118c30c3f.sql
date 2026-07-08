
create type public.receipt_job_status as enum ('queued','processing','done','failed');

create table public.receipt_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  receipt_path text not null,
  status public.receipt_job_status not null default 'queued',
  result_json jsonb,
  error text,
  expense_id uuid,
  consumed boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receipt_jobs_user_active_idx
  on public.receipt_jobs (user_id, consumed, created_at desc);

alter table public.receipt_jobs enable row level security;

create policy "receipt_jobs owner read"
  on public.receipt_jobs for select to authenticated
  using (user_id = auth.uid());

create policy "receipt_jobs owner insert"
  on public.receipt_jobs for insert to authenticated
  with check (user_id = auth.uid());

create policy "receipt_jobs owner update"
  on public.receipt_jobs for update to authenticated
  using (user_id = auth.uid());

create policy "receipt_jobs owner delete"
  on public.receipt_jobs for delete to authenticated
  using (user_id = auth.uid());

create trigger receipt_jobs_set_updated_at
  before update on public.receipt_jobs
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.receipt_jobs;
alter table public.receipt_jobs replica identity full;
