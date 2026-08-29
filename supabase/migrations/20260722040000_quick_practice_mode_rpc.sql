-- Quick Practice Mode: returns full MCQ data (incl. correct_option + explanation)
-- for a readymade exam so the client can render instant right/wrong feedback.
-- Restricted to is_readymade = true exams only (never leaks live/graded exam answers).

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  explanation text,
  question_index integer
)
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
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids, v_readymade_course_ids, v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF v_is_visible_on_free IS TRUE THEN
    v_has_access := true;
  END IF;

  IF NOT v_has_access AND v_exam_course_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments en
      WHERE en.profile_id = p_user_id
      AND en.course_id = v_exam_course_id
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.enrollments e
        JOIN public.courses c ON e.course_id = c.id
        WHERE e.profile_id = p_user_id
        AND c.linked_course_ids IS NOT NULL
        AND v_exam_course_id::text = ANY(COALESCE(c.linked_course_ids, '{}')::text[])
      ) INTO v_has_access;
    END IF;
  END IF;

  IF NOT v_has_access AND v_shared_course_ids IS NOT NULL AND array_length(v_shared_course_ids, 1) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments en_shared
      WHERE en_shared.profile_id = p_user_id
      AND en_shared.course_id = ANY(v_shared_course_ids)
    ) INTO v_has_access;
  END IF;

  -- Readymade exams can also be granted access via readymade_course_ids
  -- (a set of courses whose enrollees can access this readymade exam even
  -- though the exam itself has no direct course_id).
  IF NOT v_has_access AND v_readymade_course_ids IS NOT NULL AND array_length(v_readymade_course_ids, 1) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments en_rm
      WHERE en_rm.profile_id = p_user_id
      AND en_rm.course_id = ANY(v_readymade_course_ids)
    ) INTO v_has_access;
  END IF;

  IF v_has_access THEN
    RETURN QUERY
    SELECT
      q.id,
      q.question_text,
      q.option_a,
      q.option_b,
      q.option_c,
      q.option_d,
      q.correct_option::text,
      q.explanation,
      q.question_index
    FROM public.exam_questions q
    WHERE q.exam_id = p_exam_id
    ORDER BY q.question_index ASC;
  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;
