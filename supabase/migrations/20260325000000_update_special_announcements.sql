-- Migration: Update special_exam_cards table to include button_text
ALTER TABLE public.special_exam_cards
ADD COLUMN IF NOT EXISTS button_text TEXT DEFAULT 'বিস্তারিত দেখুন';

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
