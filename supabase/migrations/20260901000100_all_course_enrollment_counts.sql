CREATE OR REPLACE FUNCTION public.get_all_course_enrollment_counts()
RETURNS TABLE(course_id uuid, enrollment_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT course_id, COUNT(*)::integer AS enrollment_count
  FROM public.enrollments
  GROUP BY course_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_course_enrollment_counts() TO anon, authenticated;
