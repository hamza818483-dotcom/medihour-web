-- Add new columns to exam_questions table to support extended metadata from JSON imports
ALTER TABLE public.exam_questions
ADD COLUMN IF NOT EXISTS subject text,
ADD COLUMN IF NOT EXISTS chapter text,
ADD COLUMN IF NOT EXISTS topic text,
ADD COLUMN IF NOT EXISTS exam_code text,
ADD COLUMN IF NOT EXISTS year text,
ADD COLUMN IF NOT EXISTS difficulty text,
ADD COLUMN IF NOT EXISTS tags text[];
