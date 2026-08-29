-- Course-level "All Archive Classes" toggle, mirroring readymade_full_access.
-- When true, students enrolled in this course get access to every archive
-- class (including future ones), without needing per-chapter grants in
-- course_readymade_access (mode='archive-class').
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS archive_full_access boolean DEFAULT false;

COMMENT ON COLUMN public.courses.archive_full_access IS 'If true, students enrolled in this course have access to all Archive Classes (including future ones), bypassing per-chapter course_readymade_access grants.';
