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
