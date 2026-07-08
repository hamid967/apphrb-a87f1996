
alter table public.filter_analytics_events
  add column if not exists action text,
  add column if not exists prev_event_name text,
  add column if not exists prev_event_age_ms int;
