-- Add is_premium (PRO badge) to focus_mood_leaderboard: true only for students
-- with an active enrollment in a PAID course (course.price > 0), not just any
-- logged-in/free-registered user. Matches AtlasApp's PRO badge semantics.

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
