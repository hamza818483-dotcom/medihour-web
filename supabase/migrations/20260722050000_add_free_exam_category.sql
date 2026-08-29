-- Add category to exams for grouping Free Exam section by type
-- (HSC / Medical / Varsity / Onushilon), shown in admin add-form and
-- user-facing Free Exam page as a top-level filter.
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS free_exam_category TEXT DEFAULT 'HSC' NOT NULL;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
