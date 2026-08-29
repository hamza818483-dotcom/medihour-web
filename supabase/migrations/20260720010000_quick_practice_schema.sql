-- Quick Practice feature: subjects, chapters, mcqs, user points, attempts, leaderboard

create table if not exists public.qp_subjects (
  id bigint generated always as identity primary key,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.qp_chapters (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.qp_subjects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.qp_mcqs (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.qp_chapters(id) on delete cascade,
  question text not null,
  options jsonb not null, -- ["opt1","opt2","opt3","opt4"]
  correct_index int not null,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.qp_user_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_points int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.qp_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null, -- 'random' | 'selected'
  chapter_ids bigint[],
  total_questions int not null default 0,
  correct_count int not null default 0,
  points_earned int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_qp_chapters_subject on public.qp_chapters(subject_id);
create index if not exists idx_qp_mcqs_chapter on public.qp_mcqs(chapter_id);
create index if not exists idx_qp_attempts_user on public.qp_attempts(user_id);

alter table public.qp_subjects enable row level security;
alter table public.qp_chapters enable row level security;
alter table public.qp_mcqs enable row level security;
alter table public.qp_user_points enable row level security;
alter table public.qp_attempts enable row level security;

-- Public read access for content tables (subjects/chapters/mcqs)
create policy "qp_subjects_select_all" on public.qp_subjects for select using (true);
create policy "qp_chapters_select_all" on public.qp_chapters for select using (true);
create policy "qp_mcqs_select_all" on public.qp_mcqs for select using (true);

-- Admin/teacher write access for content tables
create policy "qp_subjects_admin_write" on public.qp_subjects for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "qp_chapters_admin_write" on public.qp_chapters for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "qp_mcqs_admin_write" on public.qp_mcqs for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Points: user can read/update own row, leaderboard readable by everyone
create policy "qp_points_select_all" on public.qp_user_points for select using (true);
create policy "qp_points_upsert_own" on public.qp_user_points for insert with check (auth.uid() = user_id);
create policy "qp_points_update_own" on public.qp_user_points for update using (auth.uid() = user_id);

-- Attempts: user can insert/read own attempts only
create policy "qp_attempts_select_own" on public.qp_attempts for select using (auth.uid() = user_id);
create policy "qp_attempts_insert_own" on public.qp_attempts for insert with check (auth.uid() = user_id);

-- RPC: atomically add points to a user (creates row if missing)
create or replace function public.qp_add_points(p_user_id uuid, p_points int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.qp_user_points (user_id, total_points, updated_at)
  values (p_user_id, greatest(p_points, 0), now())
  on conflict (user_id) do update
    set total_points = public.qp_user_points.total_points + p_points,
        updated_at = now();
end;
$$;

grant execute on function public.qp_add_points(uuid, int) to authenticated;
