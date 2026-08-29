-- The curated "Unlimited Mock Test" list (mock_exams / mock_exam_questions)
-- has been removed from the app in favor of the AtlasApp-style flow:
-- subject → chapter → topic → random questions from mock_question_pool.
-- These 2 tables are no longer referenced anywhere in the codebase.

DROP TABLE IF EXISTS public.mock_exam_questions CASCADE;
DROP TABLE IF EXISTS public.mock_exams CASCADE;

-- mock_exam_attempts is still used by PlayUnlimitedMock.tsx as a best-effort
-- attempt-history log, so it's kept — but its mock_exam_id FK pointed at the
-- now-dropped mock_exams table (and was NOT NULL, so every insert from the
-- pool-based flow was silently failing already). Make it nullable and drop
-- the dangling FK so pool-based attempts (which have no mock_exam_id) can
-- actually be recorded.
ALTER TABLE public.mock_exam_attempts
  ALTER COLUMN mock_exam_id DROP NOT NULL;

ALTER TABLE public.mock_exam_attempts
  DROP CONSTRAINT IF EXISTS mock_exam_attempts_mock_exam_id_fkey;

