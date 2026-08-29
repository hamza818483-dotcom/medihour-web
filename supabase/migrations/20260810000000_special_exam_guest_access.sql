-- Special Exam type with subject-wise segments (mandatory/optional) + per-exam guest access toggle

-- 1) Allow "special" exam_type
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_exam_type_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_exam_type_check
    CHECK (exam_type = ANY (ARRAY['live'::text, 'practice'::text, 'special'::text]));

-- 2) Per-exam toggle: allow this exam to be taken without login (guest access),
--    independent of the free-exam listing (is_visible_on_free).
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS allow_guest boolean DEFAULT false NOT NULL;

-- 3) Subject-wise segments for Special Exam questions.
--    subject: which subject/segment this question belongs to (used only when exam_type = 'special').
--    is_segment_mandatory: whether this subject-segment is mandatory (always included) or
--    optional (student selects which optional subjects they want on the pre-exam screen).
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS is_segment_mandatory boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_subject ON public.exam_questions (exam_id, subject);

COMMENT ON COLUMN public.exams.allow_guest IS 'If true, this exam can be taken without login (guest access), regardless of exam_type.';
COMMENT ON COLUMN public.exam_questions.subject IS 'Subject/segment name for Special Exam (exam_type=special); null for live/practice exams.';
COMMENT ON COLUMN public.exam_questions.is_segment_mandatory IS 'For Special Exam: true = always included, false = student picks this subject as optional on pre-exam screen.';
