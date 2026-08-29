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
