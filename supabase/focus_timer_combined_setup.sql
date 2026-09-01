-- ===== FILE: 20260720020000_focus_timer_schema.sql =====
-- Add avatar_url to profiles (LMS has it, medihour didn't) — required by
-- focus_mood_leaderboard which selects p.avatar_url for the leaderboard UI.
alter table public.profiles add column if not exists avatar_url text;

-- Focus Timer feature: study/break/sleep session tracking + leaderboard

create table if not exists public.focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null check (mood in ('study','break','sleep')),
  duration_seconds int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_focus_sessions_user on public.focus_sessions(user_id);
create index if not exists idx_focus_sessions_created on public.focus_sessions(created_at);

alter table public.focus_sessions enable row level security;

create policy "focus_sessions_select_own" on public.focus_sessions for select using (auth.uid() = user_id);
create policy "focus_sessions_insert_own" on public.focus_sessions for insert with check (auth.uid() = user_id);
create policy "focus_sessions_update_own" on public.focus_sessions for update using (auth.uid() = user_id);

-- Leaderboard needs aggregate study time visible to everyone (not raw sessions).
-- Expose only what's needed via a security-definer function.
create or replace function public.focus_leaderboard(p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  select
    fs.user_id,
    p.full_name,
    p.hsc_batch,
    sum(fs.duration_seconds)::bigint as total_seconds
  from public.focus_sessions fs
  join public.profiles p on p.id = fs.user_id
  where fs.mood = 'study'
    and fs.created_at >= now() - (p_days || ' days')::interval
  group by fs.user_id, p.full_name, p.hsc_batch
  order by total_seconds desc
  limit 100;
$$;

grant execute on function public.focus_leaderboard(int) to authenticated, anon;


-- ===== FILE: 20260720030000_focus_timer_live_and_mood_leaderboard.sql =====
-- Focus Timer: live session tracking (resume across refresh, "studying now" list)
-- + per-mood (study/break/sleep) leaderboards.

alter table public.focus_sessions
  add column if not exists is_paused boolean not null default false,
  add column if not exists status text not null default 'ended'
    check (status in ('active', 'ended'));

create index if not exists idx_focus_sessions_status on public.focus_sessions(status);

-- Only one active/live segment per user at a time.
create unique index if not exists uq_focus_sessions_active_per_user
  on public.focus_sessions(user_id)
  where (status = 'active');

alter table public.focus_sessions enable row level security;

-- Anyone signed in can see who else has a live "active" segment right now
-- (for the "studying now" list); own historical rows already covered by
-- the existing select policy.
drop policy if exists "focus_sessions_select_active_public" on public.focus_sessions;
create policy "focus_sessions_select_active_public"
  on public.focus_sessions for select
  using (status = 'active');

-- start (or resume into) a live segment; returns the session id
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

  insert into public.focus_sessions (user_id, mood, duration_seconds, started_at, status, is_paused)
  values (auth.uid(), p_mood, 0, now(), 'active', false)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.focus_start_session(text, bigint) to authenticated;

-- periodic heartbeat while running (updates elapsed + pause flag on the live row)
create or replace function public.focus_update_session(p_id bigint, p_duration_seconds int, p_is_paused boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.focus_sessions
    set duration_seconds = p_duration_seconds, is_paused = p_is_paused
    where id = p_id and user_id = auth.uid() and status = 'active';
$$;

grant execute on function public.focus_update_session(bigint, int, boolean) to authenticated;

-- close out a live segment (mood switch or stop)
create or replace function public.focus_end_session(p_id bigint, p_duration_seconds int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.focus_sessions
    set status = 'ended', duration_seconds = p_duration_seconds, ended_at = now(), is_paused = false
    where id = p_id and user_id = auth.uid() and status = 'active';
$$;

grant execute on function public.focus_end_session(bigint, int) to authenticated;

-- "studying/on break/sleeping now" list: live active rows joined with profile info
create or replace function public.focus_live_now()
returns table(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at
  from public.focus_sessions fs
  join public.profiles p on p.id = fs.user_id
  where fs.status = 'active'
  order by fs.duration_seconds desc
  limit 200;
$$;

grant execute on function public.focus_live_now() to authenticated, anon;

-- Per-mood leaderboard (study/break/sleep), merging ended history with any
-- currently-active live segment so totals don't lag behind reality.
DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);
create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.mood = p_mood
      and fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id
  ),
  live as (
    select fs.user_id, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.mood = p_mood and fs.status = 'active'
  ),
  combined as (
    select user_id, secs from ended
    union all
    select user_id, secs from live
  ),
  totals as (
    select user_id, sum(secs)::bigint as total_seconds
    from combined
    group by user_id
  )
  select t.user_id, p.full_name, p.hsc_batch, t.total_seconds
  from totals t
  join public.profiles p on p.id = t.user_id
  order by t.total_seconds desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;

-- Keep the original study-only leaderboard working (now live-merged too),
-- since existing frontend code may still call it.
create or replace function public.focus_leaderboard(p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  select * from public.focus_mood_leaderboard('study', p_days);
$$;

grant execute on function public.focus_leaderboard(int) to authenticated, anon;


-- ===== FILE: 20260720040000_focus_history_rpc.sql =====
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


-- ===== FILE: 20260720050000_focus_compare_daily_rpc.sql =====
-- Compare feature: day-wise Study totals for the caller + one other user, over N days.
-- Only Study-mode seconds are exposed (matches what the public leaderboard already reveals).

create or replace function public.focus_compare_daily(p_other_user uuid, p_days int)
returns table(user_id uuid, day date, total_seconds bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    fs.user_id,
    (fs.started_at at time zone 'Asia/Dhaka')::date as day,
    sum(fs.duration_seconds)::bigint as total_seconds
  from public.focus_sessions fs
  where fs.mood = 'study'
    and fs.user_id in (auth.uid(), p_other_user)
    and fs.started_at >= now() - (p_days || ' days')::interval
  group by fs.user_id, day
  order by day asc;
$$;

grant execute on function public.focus_compare_daily(uuid, int) to authenticated;


-- ===== FILE: 20260722010000_focus_breaks_used_accuracy.sql =====
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


-- ===== FILE: 20260722020000_focus_leaderboard_score_ranking.sql =====
-- Focus Timer: score-based leaderboard ranking, matching AtlasApp's Ultimate
-- Leaderboard formula exactly: rank order is decided by a penalty score
-- (more break/sleep time = lower rank), while the displayed number stays the
-- plain mode-specific total_seconds.
--   score = study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)
--
-- This only affects ranking ORDER; the displayed total_seconds for the
-- requested mood is unchanged, so break/sleep leaderboards still show their
-- own raw totals — they're just sorted using the same overall score so a
-- student who breaks/sleeps a lot doesn't rank falsely high.

DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);
create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id, fs.mood
  ),
  live as (
    select fs.user_id, fs.mood, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  combined as (
    select user_id, mood, secs from ended
    union all
    select user_id, mood, secs from live
  ),
  per_user_mood as (
    select user_id, mood, sum(secs)::bigint as secs
    from combined
    group by user_id, mood
  ),
  per_user as (
    select
      user_id,
      coalesce(sum(secs) filter (where mood = 'study'), 0)::bigint as study_seconds,
      coalesce(sum(secs) filter (where mood = 'break'), 0)::bigint as break_seconds,
      coalesce(sum(secs) filter (where mood = 'sleep'), 0)::bigint as sleep_seconds
    from per_user_mood
    group by user_id
  ),
  scored as (
    select
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) as score
    from per_user
    where study_seconds > 0 or break_seconds > 0 or sleep_seconds > 0
  )
  select
    s.user_id,
    p.full_name,
    p.hsc_batch,
    case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end as total_seconds
  from scored s
  join public.profiles p on p.id = s.user_id
  where case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end > 0
  order by s.score desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;


-- ===== FILE: 20260722030000_focus_breaks_today_rpc.sql =====
-- Focus Timer compare modal: today's break count for any user (self or peer),
-- matching AtlasApp's "বিরতি (আজ)" comparison row. Counts break-mood segments
-- started today (Asia/Dhaka), including one for the currently active live segment.
create or replace function public.focus_breaks_today(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint
  from public.focus_sessions fs
  where fs.user_id = p_user_id
    and fs.mood = 'break'
    and (fs.started_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date;
$$;

grant execute on function public.focus_breaks_today(uuid) to authenticated, anon;


-- ===== FILE: 20260722030000_focus_leaderboard_avatar_status.sql =====
-- Focus Leaderboard: add profile photo (avatar_url) and live status
-- (mood + is_paused, only when the user currently has an active session)
-- to focus_mood_leaderboard, matching AtlasApp's buildRankCard which shows
-- a real profile photo and a Live/Break/Sleep/Pause status pill per row.

DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);
create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(
  user_id uuid,
  full_name text,
  hsc_batch text,
  total_seconds bigint,
  avatar_url text,
  live_mood text,
  is_paused boolean
)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id, fs.mood
  ),
  live as (
    select fs.user_id, fs.mood, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  combined as (
    select user_id, mood, secs from ended
    union all
    select user_id, mood, secs from live
  ),
  per_user_mood as (
    select user_id, mood, sum(secs)::bigint as secs
    from combined
    group by user_id, mood
  ),
  per_user as (
    select
      user_id,
      coalesce(sum(secs) filter (where mood = 'study'), 0)::bigint as study_seconds,
      coalesce(sum(secs) filter (where mood = 'break'), 0)::bigint as break_seconds,
      coalesce(sum(secs) filter (where mood = 'sleep'), 0)::bigint as sleep_seconds
    from per_user_mood
    group by user_id
  ),
  scored as (
    select
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) as score
    from per_user
    where study_seconds > 0 or break_seconds > 0 or sleep_seconds > 0
  ),
  live_status as (
    select fs.user_id, fs.mood as live_mood, fs.is_paused
    from public.focus_sessions fs
    where fs.status = 'active'
  )
  select
    s.user_id,
    p.full_name,
    p.hsc_batch,
    case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end as total_seconds,
    p.avatar_url,
    ls.live_mood,
    coalesce(ls.is_paused, false) as is_paused
  from scored s
  join public.profiles p on p.id = s.user_id
  left join live_status ls on ls.user_id = s.user_id
  where case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end > 0
  order by s.score desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;


-- ===== FILE: 20260723050000_focus_leaderboard_premium_badge.sql =====
-- Add is_premium (PRO badge) to focus_mood_leaderboard: true only for students
-- with an active enrollment in a PAID course (course.price > 0), not just any
-- logged-in/free-registered user. Matches AtlasApp's PRO badge semantics.

DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);
create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(
  user_id uuid,
  full_name text,
  hsc_batch text,
  total_seconds bigint,
  avatar_url text,
  live_mood text,
  is_paused boolean,
  is_premium boolean
)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id, fs.mood
  ),
  live as (
    select fs.user_id, fs.mood, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  combined as (
    select user_id, mood, secs from ended
    union all
    select user_id, mood, secs from live
  ),
  per_user_mood as (
    select user_id, mood, sum(secs)::bigint as secs
    from combined
    group by user_id, mood
  ),
  per_user as (
    select
      user_id,
      coalesce(sum(secs) filter (where mood = 'study'), 0)::bigint as study_seconds,
      coalesce(sum(secs) filter (where mood = 'break'), 0)::bigint as break_seconds,
      coalesce(sum(secs) filter (where mood = 'sleep'), 0)::bigint as sleep_seconds
    from per_user_mood
    group by user_id
  ),
  scored as (
    select
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) as score
    from per_user
    where study_seconds > 0 or break_seconds > 0 or sleep_seconds > 0
  ),
  live_status as (
    select fs.user_id, fs.mood as live_mood, fs.is_paused
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  premium_users as (
    select distinct e.profile_id
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where c.price is not null and c.price > 0
      and (e.valid_until is null or e.valid_until > now())
  )
  select
    s.user_id,
    p.full_name,
    p.hsc_batch,
    case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end as total_seconds,
    p.avatar_url,
    ls.live_mood,
    coalesce(ls.is_paused, false) as is_paused,
    (pu.profile_id is not null) as is_premium
  from scored s
  join public.profiles p on p.id = s.user_id
  left join live_status ls on ls.user_id = s.user_id
  left join premium_users pu on pu.profile_id = s.user_id
  where case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end > 0
  order by s.score desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;


-- ===== FILE: 20260723120000_focus_close_stale_live_sessions.sql =====
-- Fix: a focus session could stay status='active' forever if the browser
-- was closed, crashed, or lost connection before focus_end_session ran —
-- showing that student as "Live" with a frozen/zero duration indefinitely.
--
-- Fix: track the last heartbeat time (heartbeat already fires every 5s from
-- the client via focus_update_session), and treat any 'active' session with
-- no heartbeat in the last 60 seconds as stale — auto-close it wherever
-- live/leaderboard data is read. This does NOT change which mood list a
-- student's completed time counts toward; it only stops a dead session from
-- showing as currently "Live".

ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Backfill: treat existing active rows as if they just heartbeated, so this
-- migration doesn't instantly mass-close genuinely live sessions.
UPDATE public.focus_sessions
  SET last_heartbeat_at = now()
  WHERE status = 'active' AND last_heartbeat_at IS NULL;

-- 1. Heartbeat now stamps last_heartbeat_at.
CREATE OR REPLACE FUNCTION public.focus_update_session(p_id bigint, p_duration_seconds int, p_is_paused boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.focus_sessions
    SET duration_seconds = p_duration_seconds, is_paused = p_is_paused, last_heartbeat_at = now()
    WHERE id = p_id AND user_id = auth.uid() AND status = 'active';
$$;

-- 2. Small helper: auto-close any 'active' session that hasn't heartbeated
--    in over 60 seconds (dead tab/browser closed/crash). Safe to call often;
--    called at the top of focus_live_now() and focus_start_session() so
--    stale sessions never linger and never block a fresh session start.
CREATE OR REPLACE FUNCTION public.focus_close_stale_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.focus_sessions
    SET status = 'ended', ended_at = now(), is_paused = false
    WHERE status = 'active'
      AND COALESCE(last_heartbeat_at, started_at) < now() - interval '60 seconds';
$$;

GRANT EXECUTE ON FUNCTION public.focus_close_stale_sessions() TO authenticated, anon;

-- 3. focus_live_now: close stale sessions first, then read — so a dead
--    session never shows up as "Live" with a frozen/zero time.
DROP FUNCTION IF EXISTS public.focus_live_now();

CREATE OR REPLACE FUNCTION public.focus_live_now()
RETURNS TABLE(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  SELECT fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at, p.avatar_url
  FROM public.focus_sessions fs
  JOIN public.profiles p ON p.id = fs.user_id
  WHERE fs.status = 'active'
  ORDER BY fs.duration_seconds DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_live_now() TO authenticated, anon;

-- 5. focus_mood_leaderboard also UNIONs live 'active' sessions into the
--    ranking (see 20260722020000_focus_leaderboard_score_ranking.sql) — a
--    stale session there would similarly inflate/freeze a student's ranked
--    time. Wrap it to sweep stale sessions first, keeping the exact same
--    ranking logic/signature as before.
DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);

CREATE OR REPLACE FUNCTION public.focus_mood_leaderboard(p_mood text, p_days int)
RETURNS TABLE(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  WITH ended AS (
    SELECT fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'ended'
      AND fs.created_at >= now() - (p_days || ' days')::interval
    GROUP BY fs.user_id, fs.mood
  ),
  live AS (
    SELECT fs.user_id, fs.mood, fs.duration_seconds::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'active'
  ),
  combined AS (
    SELECT user_id, mood, secs FROM ended
    UNION ALL
    SELECT user_id, mood, secs FROM live
  ),
  per_user_mood AS (
    SELECT user_id, mood, sum(secs)::bigint AS secs
    FROM combined
    GROUP BY user_id, mood
  ),
  per_user AS (
    SELECT
      user_id,
      COALESCE(sum(secs) FILTER (WHERE mood = 'study'), 0)::bigint AS study_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'break'), 0)::bigint AS break_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'sleep'), 0)::bigint AS sleep_seconds
    FROM per_user_mood
    GROUP BY user_id
  ),
  scored AS (
    SELECT
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) AS score
    FROM per_user
    WHERE study_seconds > 0 OR break_seconds > 0 OR sleep_seconds > 0
  )
  SELECT
    s.user_id,
    p.full_name,
    p.hsc_batch,
    CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END AS total_seconds
  FROM scored s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END > 0
  ORDER BY s.score DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_mood_leaderboard(text, int) TO authenticated, anon;


-- ===== FILE: 20260815000000_fix_focus_leaderboard_ambiguous_user_id.sql =====
-- Fix: converting focus_mood_leaderboard to plpgsql (stale-session sweep migration)
-- introduced a RETURNS TABLE(user_id uuid, ...) OUT parameter that collides with the
-- bare `user_id` column references inside the CTEs, causing:
--   ERROR: 42702: column reference "user_id" is ambiguous
-- Fix: qualify every user_id reference inside the CTEs with its source alias.

DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);

CREATE OR REPLACE FUNCTION public.focus_mood_leaderboard(p_mood text, p_days int)
RETURNS TABLE(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  WITH ended AS (
    SELECT fs.user_id AS uid, fs.mood, sum(fs.duration_seconds)::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'ended'
      AND fs.created_at >= now() - (p_days || ' days')::interval
    GROUP BY fs.user_id, fs.mood
  ),
  live AS (
    SELECT fs.user_id AS uid, fs.mood, fs.duration_seconds::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'active'
  ),
  combined AS (
    SELECT uid, mood, secs FROM ended
    UNION ALL
    SELECT uid, mood, secs FROM live
  ),
  per_user_mood AS (
    SELECT uid, mood, sum(secs)::bigint AS secs
    FROM combined
    GROUP BY uid, mood
  ),
  per_user AS (
    SELECT
      uid,
      COALESCE(sum(secs) FILTER (WHERE mood = 'study'), 0)::bigint AS study_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'break'), 0)::bigint AS break_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'sleep'), 0)::bigint AS sleep_seconds
    FROM per_user_mood
    GROUP BY uid
  ),
  scored AS (
    SELECT
      uid,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) AS score
    FROM per_user
    WHERE study_seconds > 0 OR break_seconds > 0 OR sleep_seconds > 0
  )
  SELECT
    s.uid,
    p.full_name,
    p.hsc_batch,
    CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END AS total_seconds
  FROM scored s
  JOIN public.profiles p ON p.id = s.uid
  WHERE CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END > 0
  ORDER BY s.score DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_mood_leaderboard(text, int) TO authenticated, anon;


