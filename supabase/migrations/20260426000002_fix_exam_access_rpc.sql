-- ====================================================================
-- Migration: Fix Readymade Exam Access & Recursive Linked Courses
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid()) 
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, question_index integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
BEGIN
  -- 1. Get Exam Metadata
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids, v_readymade_course_ids, v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  -- 2. Check Access Logic
  
  -- Case A: Public / Free Exam
  IF v_is_visible_on_free IS TRUE THEN
      v_has_access := true;
  END IF;

  -- Case B: Course-based Access (Direct, Linked Recursive, Shared, Readymade)
  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          -- Base case: Courses the user is directly enrolled in (and not expired)
          SELECT course_id 
          FROM public.enrollments 
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())
          
          UNION
          
          -- Recursive step: Follow linked_course_ids
          -- We use a recursive CTE to find all courses linked to the student's enrolled courses
          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE 
            -- Match primary course ID
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            -- Match shared course IDs
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            -- Match readymade course IDs
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
      ) INTO v_has_access;
  END IF;

  -- 3. Return Questions if Access Granted
  IF v_has_access THEN
      RETURN QUERY
      SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.question_index
      FROM public.exam_questions q
      WHERE q.exam_id = p_exam_id
      ORDER BY q.question_index ASC;
  ELSE
      -- Return Empty (Access Denied)
      RETURN;
  END IF;
END;
$$;

-- Ensure permissions are set
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;
