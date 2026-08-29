-- Add sort_order columns to classes and exams for drag-and-drop ordering
-- Classes: per-course sort, free sort
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS archive_sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS free_sort_order integer DEFAULT 0 NOT NULL;

-- Exams: per-course sort, archive/readymade/free per-chapter sort
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS archive_sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS readymade_sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS free_sort_order integer DEFAULT 0 NOT NULL;
