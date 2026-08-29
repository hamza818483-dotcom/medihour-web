-- Bookmarks for Unlimited Mock Test questions. Since pool questions are dynamic
-- (randomly generated from JSON, not fixed rows), we store a snapshot per bookmark.

create table if not exists public.mock_question_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null, -- stable hash/id of the question text, used to dedupe
  exam_name text,
  subject text,
  chapter text,
  question_text text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  explanation text,
  created_at timestamptz not null default now(),
  unique (user_id, question_key)
);

create index if not exists idx_mock_bookmarks_user on public.mock_question_bookmarks(user_id);

alter table public.mock_question_bookmarks enable row level security;

create policy "mock_bookmarks_own_select" on public.mock_question_bookmarks
  for select using (auth.uid() = user_id);

create policy "mock_bookmarks_own_insert" on public.mock_question_bookmarks
  for insert with check (auth.uid() = user_id);

create policy "mock_bookmarks_own_delete" on public.mock_question_bookmarks
  for delete using (auth.uid() = user_id);
