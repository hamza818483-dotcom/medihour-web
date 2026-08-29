-- AtlasApp-style Unlimited Mock Test: student picks subject/chapter/topic/standard/count
-- and gets a randomly generated test from a shared question pool (no fixed "exam" entity).

create table if not exists public.mock_question_pool (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  paper text,
  chapter text not null,
  topic text,
  standard text not null default 'medical', -- medical | varsity | onushiloni
  question_count int not null default 0,
  questions_json jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mock_pool_subject_chapter on public.mock_question_pool(subject, chapter);
create index if not exists idx_mock_pool_standard on public.mock_question_pool(standard);

alter table public.mock_question_pool enable row level security;

create policy "mock_pool_select_all" on public.mock_question_pool
  for select using (true);

create policy "mock_pool_admin_all" on public.mock_question_pool
  for all using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Attempts from the pool-based (dynamic) mock test have no fixed mock_exam_id.
alter table public.mock_exam_attempts alter column mock_exam_id drop not null;
