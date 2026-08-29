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
