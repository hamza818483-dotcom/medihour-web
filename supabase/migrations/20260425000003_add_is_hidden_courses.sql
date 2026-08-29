-- Add is_hidden column to courses for hiding without deactivating
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false NOT NULL;
