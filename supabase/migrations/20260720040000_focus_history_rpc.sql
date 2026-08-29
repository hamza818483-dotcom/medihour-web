-- Study History page: user's own day-by-day focus session history.
-- Returns one row per calendar day (based on started_at), with mood totals summed,
-- so the client can render a day-wise history list + 7-day chart without pulling raw rows.

create or replace function public.focus_history_daily(p_days int default 30)
returns table(
  day date,
  study_seconds bigint,
  break_seconds bigint,
  sleep_seconds bigint,
  breaks_used bigint,
  session_count bigint,
  is_ongoing boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (fs.started_at at time zone 'Asia/Dhaka')::date as day,
    sum(case when fs.mood = 'study' then fs.duration_seconds else 0 end)::bigint as study_seconds,
    sum(case when fs.mood = 'break' then fs.duration_seconds else 0 end)::bigint as break_seconds,
    sum(case when fs.mood = 'sleep' then fs.duration_seconds else 0 end)::bigint as sleep_seconds,
    sum(case when fs.mood = 'break' then 1 else 0 end)::bigint as breaks_used,
    count(*)::bigint as session_count,
    bool_or(fs.ended_at is null) as is_ongoing
  from public.focus_sessions fs
  where fs.user_id = auth.uid()
    and (p_days <= 0 or fs.started_at >= now() - (p_days || ' days')::interval)
  group by day
  order by day desc
  limit 400;
$$;

grant execute on function public.focus_history_daily(int) to authenticated;
