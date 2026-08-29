-- Quick Practice: bookmarks + detail solve sheet support

alter table public.qp_attempts
  add column if not exists details jsonb;
-- details: array of { mcq_id, question, options, correct_index, selected_index, correct, chapter_name, subject_name }

create table if not exists public.qp_bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mcq_id bigint not null references public.qp_mcqs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, mcq_id)
);

create index if not exists idx_qp_bookmarks_user on public.qp_bookmarks(user_id);
create index if not exists idx_qp_bookmarks_mcq on public.qp_bookmarks(mcq_id);

alter table public.qp_bookmarks enable row level security;

create policy "qp_bookmarks_select_own" on public.qp_bookmarks for select using (auth.uid() = user_id);
create policy "qp_bookmarks_insert_own" on public.qp_bookmarks for insert with check (auth.uid() = user_id);
create policy "qp_bookmarks_delete_own" on public.qp_bookmarks for delete using (auth.uid() = user_id);
