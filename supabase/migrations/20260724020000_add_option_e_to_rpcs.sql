-- Add option_e to exam question RPC return types (5-option MCQ support)

DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text, question_index integer)
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

  IF v_is_visible_on_free IS TRUE THEN
      v_has_access := true;
  END IF;

  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
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
        q.option_e,
        q.question_index
      FROM public.exam_questions q
      WHERE q.exam_id = p_exam_id
      ORDER BY q.question_index ASC;
  ELSE
      RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;


DROP FUNCTION IF EXISTS public.get_exam_questions_practice(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  option_e text,
  correct_option text,
  explanation text,
  question_index integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_is_readymade boolean;
BEGIN
  SELECT ex.is_readymade
  INTO v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.option_e,
    q.correct_option::text,
    q.explanation,
    q.question_index
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
  ORDER BY q.question_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;
