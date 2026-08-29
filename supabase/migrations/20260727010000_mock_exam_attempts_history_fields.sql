-- Unlimited Mock Test attempts currently store no subject/chapter/questions,
-- and mock_exam_id is NOT NULL even though the unlimited-pool flow inserts
-- mock_exam_id: null (PlayUnlimitedMock.tsx). This has silently made every
-- unlimited mock attempt insert fail. Add the fields needed for a subject-wise
-- History page (subject, chapter, topic, question count, date/time, and a
-- questions+answers snapshot so "Result Sheet" can replay the result view),
-- and relax the FK to allow unlimited-pool attempts.

alter table public.mock_exam_attempts
  alter column mock_exam_id drop not null;

alter table public.mock_exam_attempts
  add column if not exists subject text,
  add column if not exists chapter text,
  add column if not exists topic text,
  add column if not exists title text,
  add column if not exists session_id text,
  add column if not exists total_questions int,
  add column if not exists questions_snapshot jsonb;

create index if not exists idx_mock_exam_attempts_user_submitted
  on public.mock_exam_attempts(user_id, submitted_at desc);
