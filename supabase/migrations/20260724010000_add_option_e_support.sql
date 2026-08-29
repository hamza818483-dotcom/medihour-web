-- Add support for a 5th MCQ option (option_e)
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS option_e text;

ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_correct_option_check;

ALTER TABLE public.exam_questions
  ADD CONSTRAINT exam_questions_correct_option_check
  CHECK (correct_option = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar, 'E'::bpchar]));
