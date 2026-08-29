-- Fix breaks_used accuracy to match AtlasApp's client-side counter behavior:
-- AtlasApp increments breaksUsed exactly once per Study -> Break transition
-- (not once per DB row). Our old focus_history_daily counted every
-- mood='break' row as one break, which over-counts whenever a single break
-- stretch spans more than one row (e.g. app reload/resume mid-break).
--
-- Fix: store the actual break-transition flag on the row where the break
-- STARTED (is_break_start = true only on the first segment of a break
-- stretch), and sum that flag instead of counting all break rows.

alter table public.focus_sessions
  add column if not exists is_break_start boolean not null default false;

-- Re-create focus_start_session so it marks is_break_start correctly:
--   - resuming an existing active row (p_resume_id) never re-marks it
--   - starting a brand new 'break' row is marked as a break start
--   - starting 'study'/'sleep' rows is never marked
create or replace function public.focus_start_session(p_mood text, p_resume_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_resume_id is not null then
    update public.focus_sessions
      set is_paused = false
      where id = p_resume_id and user_id = auth.uid() and status = 'active'
      returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- end any stray active segment for this user before starting a new one
  update public.focus_sessions
    set status = 'ended', ended_at = now()
    where user_id = auth.uid() and status = 'active';

  insert into public.focus_sessions (user_id, mood, duration_seconds, started_at, status, is_paused, is_break_start)
  values (auth.uid(), p_mood, 0, now(), 'active', false, (p_mood = 'break'))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.focus_start_session(text, bigint) to authenticated;

-- focus_history_daily: sum is_break_start flags instead of counting all
-- break-mood rows, so multi-row break stretches (due to reload/resume)
-- count as exactly one break, matching AtlasApp.
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
    sum(case when fs.is_break_start then 1 else 0 end)::bigint as breaks_used,
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
