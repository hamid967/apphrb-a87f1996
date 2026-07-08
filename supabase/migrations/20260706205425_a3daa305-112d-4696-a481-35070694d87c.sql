
create table public.filter_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  event_name text not null,
  filter_key text,
  source text,
  chip_count int,
  remaining int,
  distance_px int,
  progress numeric,
  reached_end boolean,
  path text,
  created_at timestamptz not null default now()
);

create index filter_analytics_events_user_created_idx
  on public.filter_analytics_events (user_id, created_at desc);
create index filter_analytics_events_event_name_idx
  on public.filter_analytics_events (event_name);

grant select, insert on public.filter_analytics_events to authenticated;
grant all on public.filter_analytics_events to service_role;

alter table public.filter_analytics_events enable row level security;

create policy "users insert own filter analytics"
  on public.filter_analytics_events
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users read own filter analytics"
  on public.filter_analytics_events
  for select to authenticated
  using (auth.uid() = user_id);
