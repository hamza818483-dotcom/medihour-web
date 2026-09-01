-- Allow anonymous/public users to see enrollment counts per course
CREATE OR REPLACE FUNCTION public.get_course_enrollment_count(p_course_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.enrollments WHERE course_id = p_course_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_course_enrollment_count(uuid) TO anon, authenticated;
