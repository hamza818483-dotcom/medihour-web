-- Link reviews to a specific course (for per-course review carousel on CourseDetails)
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reviews_course_id ON public.reviews(course_id);

-- Join table linking mentors to courses (a course can have multiple mentors)
CREATE TABLE IF NOT EXISTS public.course_mentors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  experience_years text,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(course_id, mentor_id)
);

ALTER TABLE public.course_mentors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to course_mentors" ON public.course_mentors;
DROP POLICY IF EXISTS "Admins can manage course_mentors" ON public.course_mentors;

CREATE POLICY "Public read access to course_mentors" ON public.course_mentors
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage course_mentors" ON public.course_mentors
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
