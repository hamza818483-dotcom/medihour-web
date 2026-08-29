-- Migration: Add is_only_live to exams table
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_only_live BOOLEAN DEFAULT false;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
