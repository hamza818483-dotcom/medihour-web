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
