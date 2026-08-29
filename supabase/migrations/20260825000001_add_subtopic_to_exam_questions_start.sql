-- Return subtopic from get_exam_questions_start alongside topic, so
-- TakeExam's ?topic=&subtopic= filtering (from the Readymade topic-tree
-- dropdown) has a subtopic value to filter on client-side.

DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text,
  question_index integer, subject text, is_segment_mandatory boolean, topic text, subtopic text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_allow_guest boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
  v_parent_exam_id uuid;
  v_split_start integer;
  v_split_end integer;
  v_source_exam_id uuid;
BEGIN
  SELECT ex.course_id, ex.is_visible_on_free, COALESCE(ex.allow_guest, false), ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade,
         ex.parent_exam_id, ex.split_start, ex.split_end
  INTO v_exam_course_id, v_is_visible_on_free, v_allow_guest, v_shared_course_ids, v_readymade_course_ids, v_is_readymade,
       v_parent_exam_id, v_split_start, v_split_end
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  v_source_exam_id := COALESCE(v_parent_exam_id, p_exam_id);

  IF v_is_visible_on_free IS TRUE OR v_allow_guest IS TRUE THEN
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
        q.question_index,
        q.subject,
        COALESCE(q.is_segment_mandatory, true),
        q.topic,
        q.subtopic
      FROM public.exam_questions q
      WHERE q.exam_id = v_source_exam_id
        AND (v_parent_exam_id IS NULL OR q.question_index BETWEEN v_split_start AND v_split_end)
      ORDER BY q.question_index ASC;
  ELSE
      RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
