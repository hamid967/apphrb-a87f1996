-- 1. Admin SELECT policy
create policy "super_admin reads all filter analytics"
  on public.filter_analytics_events
  for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

-- 2. Composite index for time-bucketed aggregation
create index if not exists idx_filter_analytics_events_created_event
  on public.filter_analytics_events (created_at desc, event_name);

-- 3. Aggregation RPCs (all defense-in-depth: check super_admin inside)

create or replace function public.admin_filter_analytics_overview(_hours int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _since timestamptz := now() - make_interval(hours => greatest(1, least(_hours, 168)));
  _prev_since timestamptz := _since - make_interval(hours => greatest(1, least(_hours, 168)));
  _total bigint;
  _prev_total bigint;
  _users bigint;
  _sessions bigint;
  _active bigint;
  _event_breakdown jsonb;
  _source_breakdown jsonb;
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'forbidden';
  end if;

  select count(*) into _total
    from public.filter_analytics_events
    where created_at >= _since;

  select count(*) into _prev_total
    from public.filter_analytics_events
    where created_at >= _prev_since and created_at < _since;

  select count(distinct user_id) into _users
    from public.filter_analytics_events
    where created_at >= _since;

  select count(distinct session_id) into _sessions
    from public.filter_analytics_events
    where created_at >= _since and session_id is not null;

  select count(distinct session_id) into _active
    from public.filter_analytics_events
    where created_at >= now() - interval '1 hour' and session_id is not null;

  select coalesce(jsonb_object_agg(event_name, cnt), '{}'::jsonb) into _event_breakdown
    from (
      select event_name, count(*)::bigint as cnt
      from public.filter_analytics_events
      where created_at >= _since
      group by event_name
    ) t;

  select coalesce(jsonb_object_agg(coalesce(source, 'unknown'), cnt), '{}'::jsonb) into _source_breakdown
    from (
      select source, count(*)::bigint as cnt
      from public.filter_analytics_events
      where created_at >= _since
        and event_name = 'active_filters.chip_remove'
      group by source
    ) t;

  return jsonb_build_object(
    'windowHours', _hours,
    'totalEvents', _total,
    'previousTotalEvents', _prev_total,
    'uniqueUsers', _users,
    'uniqueSessions', _sessions,
    'activeSessionsLastHour', _active,
    'eventBreakdown', _event_breakdown,
    'sourceBreakdown', _source_breakdown
  );
end;
$$;

create or replace function public.admin_filter_analytics_hourly(_hours int)
returns table(hour timestamptz, events bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'forbidden';
  end if;

  return query
  select date_trunc('hour', created_at) as hour, count(*)::bigint as events
  from public.filter_analytics_events
  where created_at >= now() - make_interval(hours => greatest(1, least(_hours, 168)))
  group by 1
  order by 1;
end;
$$;

create or replace function public.admin_filter_analytics_top_filters(_hours int, _limit int)
returns table(filter_key text, remove_count bigint, apply_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'forbidden';
  end if;

  return query
  select
    fk as filter_key,
    sum(case when event_name = 'active_filters.chip_remove' then 1 else 0 end)::bigint as remove_count,
    sum(case when event_name = 'active_filters.chip_apply' then 1 else 0 end)::bigint as apply_count
  from public.filter_analytics_events,
    lateral (select filter_key as fk) l
  where created_at >= now() - make_interval(hours => greatest(1, least(_hours, 168)))
    and filter_key is not null
    and event_name in ('active_filters.chip_remove', 'active_filters.chip_apply')
  group by fk
  order by (remove_count + apply_count) desc
  limit greatest(1, least(_limit, 50));
end;
$$;

create or replace function public.admin_filter_analytics_top_paths(_hours int, _limit int)
returns table(path text, events bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'forbidden';
  end if;

  return query
  select coalesce(path, 'unknown') as path, count(*)::bigint as events
  from public.filter_analytics_events
  where created_at >= now() - make_interval(hours => greatest(1, least(_hours, 168)))
  group by 1
  order by events desc
  limit greatest(1, least(_limit, 50));
end;
$$;

create or replace function public.admin_filter_analytics_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _last timestamptz;
  _last_hour bigint;
  _prev_hour bigint;
  _users_24h bigint;
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'forbidden';
  end if;

  select max(created_at) into _last from public.filter_analytics_events;

  select count(*) into _last_hour
    from public.filter_analytics_events
    where created_at >= now() - interval '1 hour';

  select count(*) into _prev_hour
    from public.filter_analytics_events
    where created_at >= now() - interval '2 hours' and created_at < now() - interval '1 hour';

  select count(distinct user_id) into _users_24h
    from public.filter_analytics_events
    where created_at >= now() - interval '24 hours';

  return jsonb_build_object(
    'lastEventAt', _last,
    'lastHourEvents', _last_hour,
    'previousHourEvents', _prev_hour,
    'activeUsers24h', _users_24h
  );
end;
$$;

grant execute on function public.admin_filter_analytics_overview(int) to authenticated;
grant execute on function public.admin_filter_analytics_hourly(int) to authenticated;
grant execute on function public.admin_filter_analytics_top_filters(int, int) to authenticated;
grant execute on function public.admin_filter_analytics_top_paths(int, int) to authenticated;
grant execute on function public.admin_filter_analytics_health() to authenticated;