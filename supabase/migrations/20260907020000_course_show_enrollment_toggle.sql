-- Admin-controlled toggle: whether the public enrollment count is shown on the course details page
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS show_enrollment_count boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.courses.show_enrollment_count IS 'If false, hide the "X জন ভর্তি হয়েছে" enrollment count block on the public course details page';
