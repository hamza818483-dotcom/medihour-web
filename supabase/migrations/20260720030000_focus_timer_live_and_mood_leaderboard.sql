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
