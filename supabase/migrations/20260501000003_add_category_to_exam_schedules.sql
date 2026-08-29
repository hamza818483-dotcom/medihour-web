-- Add category_name to exam_schedules for grouping
ALTER TABLE public.exam_schedules
ADD COLUMN IF NOT EXISTS category_name TEXT DEFAULT 'এইচএসসি ২০২৬' NOT NULL;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
