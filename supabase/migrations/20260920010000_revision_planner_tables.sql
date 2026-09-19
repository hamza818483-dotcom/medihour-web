-- Revision Planner: separate syllabus tree (same shape as st_*), manual % weights.
create table if not exists public.rv_subjects (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('hsc','medical','varsity')),
  name text not null,
  short_name text,
  weight numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.rv_chapters (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.rv_subjects(id) on delete cascade,
  name text not null,
  weight numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.rv_topics (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.rv_chapters(id) on delete cascade,
  name text not null,
  weight numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_rv_chapters_subject on public.rv_chapters(subject_id);
create index if not exists idx_rv_topics_chapter on public.rv_topics(chapter_id);
create index if not exists idx_rv_subjects_mode on public.rv_subjects(mode);

alter table public.rv_subjects enable row level security;
alter table public.rv_chapters enable row level security;
alter table public.rv_topics enable row level security;

create policy "rv_subjects_select_all" on public.rv_subjects for select using (true);
create policy "rv_chapters_select_all" on public.rv_chapters for select using (true);
create policy "rv_topics_select_all" on public.rv_topics for select using (true);

create policy "rv_subjects_admin_write" on public.rv_subjects for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));
create policy "rv_chapters_admin_write" on public.rv_chapters for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));
create policy "rv_topics_admin_write" on public.rv_topics for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));
