-- Add HSC board category fields to exams for readymade section
-- Structure: Category (Board) → Subject → Chapter → Sub-chapter (Session/Year) → Exam (per board)
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS readymade_category text DEFAULT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS readymade_sub_chapter text DEFAULT NULL;

-- Also index for faster filtering
CREATE INDEX IF NOT EXISTS idx_exams_readymade_category ON public.exams(readymade_category) WHERE is_readymade = true;
