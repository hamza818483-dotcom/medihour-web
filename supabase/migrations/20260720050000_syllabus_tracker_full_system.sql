-- Syllabus Tracker full system (replaces the flat CMS list) — 100% parity with AtlasApp's
-- study-tracker.html: subjects -> chapters -> topics, per-mode (hsc/medical),
-- client-tracked per-topic completion (localStorage, same as Atlas) + aggregate
-- pct synced here for the leaderboard.

drop table if exists public.syllabus_tracker_items cascade;


create table if not exists public.st_subjects (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('hsc','medical')),
  name text not null,
  short_name text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.st_chapters (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.st_subjects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.st_topics (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.st_chapters(id) on delete cascade,
  name text not null,
  weight int not null default 1,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Aggregate per-user, per-mode progress (leaderboard). Per-topic done/undone
-- stays client-side (localStorage) exactly like AtlasApp; only the summary
-- pct is synced here.
create table if not exists public.st_user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('hsc','medical')),
  pct numeric not null default 0,
  done_topics int not null default 0,
  total_topics int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);

create index if not exists idx_st_chapters_subject on public.st_chapters(subject_id);
create index if not exists idx_st_topics_chapter on public.st_topics(chapter_id);
create index if not exists idx_st_subjects_mode on public.st_subjects(mode);

alter table public.st_subjects enable row level security;
alter table public.st_chapters enable row level security;
alter table public.st_topics enable row level security;
alter table public.st_user_progress enable row level security;

-- Public read for content tables
create policy "st_subjects_select_all" on public.st_subjects for select using (true);
create policy "st_chapters_select_all" on public.st_chapters for select using (true);
create policy "st_topics_select_all" on public.st_topics for select using (true);

-- Admin/teacher write for content tables
create policy "st_subjects_admin_write" on public.st_subjects for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "st_chapters_admin_write" on public.st_chapters for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "st_topics_admin_write" on public.st_topics for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Progress: leaderboard readable by everyone; user can only write their own row
create policy "st_progress_select_all" on public.st_user_progress for select using (true);
create policy "st_progress_upsert_own" on public.st_user_progress for insert with check (auth.uid() = user_id);
create policy "st_progress_update_own" on public.st_user_progress for update using (auth.uid() = user_id);

-- Upsert helper (mirrors AtlasApp's syncProgress POST with merge-duplicates)
create or replace function public.st_sync_progress(p_mode text, p_pct numeric, p_done int, p_total int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.st_user_progress (user_id, mode, pct, done_topics, total_topics, updated_at)
  values (auth.uid(), p_mode, p_pct, p_done, p_total, now())
  on conflict (user_id, mode) do update
    set pct = excluded.pct,
        done_topics = excluded.done_topics,
        total_topics = excluded.total_topics,
        updated_at = now();
end;
$$;

grant execute on function public.st_sync_progress(text, numeric, int, int) to authenticated;

-- Leaderboard: top progress per mode, joined with profile name/batch
create or replace function public.st_leaderboard(p_mode text)
returns table(user_id uuid, full_name text, hsc_batch text, pct numeric, done_topics int, total_topics int)
language sql
security definer
set search_path = public
as $$
  select sp.user_id, p.full_name, p.hsc_batch, sp.pct, sp.done_topics, sp.total_topics
  from public.st_user_progress sp
  join public.profiles p on p.id = sp.user_id
  where sp.mode = p_mode
  order by sp.pct desc
  limit 50;
$$;

grant execute on function public.st_leaderboard(text) to authenticated, anon;
