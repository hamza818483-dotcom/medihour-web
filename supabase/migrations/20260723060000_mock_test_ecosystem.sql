-- Unlimited Mock Test ecosystem — fully separate from the main Exam system.
-- Content authored here (subject/chapter/topic, CSV, question bank) never
-- touches the `exams` / `exam_questions` tables. Existing readymade exams
-- can optionally be "linked" (referenced) into a mock test without merging data.

create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  chapter text,
  topic text,
  duration_minutes int not null default 30,
  total_marks numeric,
  negative_mark_per_question numeric not null default 0,
  instructions text,
  is_published boolean not null default false,
  is_archive boolean not null default false,
  -- optional: this mock test is just a pointer to an existing readymade exam
  linked_exam_id uuid references public.exams(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mock_exam_questions (
  id uuid primary key default gen_random_uuid(),
  mock_exam_id uuid not null references public.mock_exams(id) on delete cascade,
  question_index int not null default 1,
  question_text text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text not null default 'A',
  marks numeric not null default 1,
  explanation text,
  subject text,
  chapter text,
  topic text,
  created_at timestamptz not null default now()
);

create table if not exists public.mock_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  mock_exam_id uuid not null references public.mock_exams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  score numeric,
  total_marks numeric,
  answers jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists idx_mock_exam_questions_exam on public.mock_exam_questions(mock_exam_id);
create index if not exists idx_mock_exam_attempts_exam on public.mock_exam_attempts(mock_exam_id);
create index if not exists idx_mock_exam_attempts_user on public.mock_exam_attempts(user_id);
create index if not exists idx_mock_exams_published on public.mock_exams(is_published, is_archive);

alter table public.mock_exams enable row level security;
alter table public.mock_exam_questions enable row level security;
alter table public.mock_exam_attempts enable row level security;

-- Public/students can read published, non-archived mock tests + their questions
create policy "mock_exams_select_published" on public.mock_exams
  for select using (is_published = true and is_archive = false);

create policy "mock_exam_questions_select_for_published" on public.mock_exam_questions
  for select using (
    exists (select 1 from public.mock_exams e where e.id = mock_exam_id and e.is_published = true and e.is_archive = false)
  );

-- Admin/teacher full access
create policy "mock_exams_admin_all" on public.mock_exams
  for all using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "mock_exam_questions_admin_all" on public.mock_exam_questions
  for all using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "mock_exam_questions_admin_read_all" on public.mock_exam_questions
  for select using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Attempts: user manages their own; admin can read all
create policy "mock_exam_attempts_own_insert" on public.mock_exam_attempts
  for insert with check (auth.uid() = user_id);

create policy "mock_exam_attempts_own_select" on public.mock_exam_attempts
  for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "mock_exam_attempts_own_update" on public.mock_exam_attempts
  for update using (auth.uid() = user_id);
