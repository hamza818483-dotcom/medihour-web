-- ====================================================================
-- Migration: Enrollment Expiry + Community Fix (Direct Enrollments Only)
-- Run this in Supabase SQL Editor
-- ====================================================================

-- 1. Add expires_at column to enrollments (safe - no error if exists)
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;

-- 2. Add index for faster expiry checks
CREATE INDEX IF NOT EXISTS idx_enrollments_expires_at 
  ON public.enrollments(expires_at) WHERE expires_at IS NOT NULL;

-- 3. Replace get_student_community_links to:
--    a) Only return communities from DIRECTLY enrolled courses (not bonus/linked courses)
--    b) Respect enrollment expiry
DROP FUNCTION IF EXISTS get_student_community_links(uuid);
DROP FUNCTION IF EXISTS get_student_community_links();

CREATE OR REPLACE FUNCTION get_student_community_links()
RETURNS TABLE (
  id uuid,
  title text,
  url text,
  description text,
  resource_type text,
  course_id uuid,
  course_name text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  -- Only resources from DIRECTLY enrolled courses (the enrollments table rows)
  -- This intentionally does NOT follow linked_course_ids / bonus courses
  -- Community should only appear for the course the student explicitly paid for
  SELECT
    r.id,
    r.title,
    r.url,
    r.description,
    r.resource_type,
    c.id as course_id,
    c.name as course_name,
    r.created_at
  FROM enrollments e
  JOIN courses c ON e.course_id = c.id
  JOIN resources r ON (
      r.course_id = c.id        -- Resource belongs to this enrolled course
      OR
      c.id = ANY(COALESCE(r.shared_course_ids, '{}'::uuid[]))  -- Resource is shared with this course
  )
  WHERE e.profile_id = v_user_id
  AND r.resource_type = 'Link'
  -- Respect enrollment expiry: expired = no access
  AND (e.expires_at IS NULL OR e.expires_at > now())

  UNION ALL

  -- Public Resources (Not tied to any specific course)
  SELECT
    r.id,
    r.title,
    r.url,
    r.description,
    r.resource_type,
    NULL::uuid as course_id,
    'Public Community'::text as course_name,
    r.created_at
  FROM resources r
  WHERE r.resource_type = 'Link'
  AND r.course_id IS NULL

  ORDER BY created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_student_community_links() TO authenticated;
