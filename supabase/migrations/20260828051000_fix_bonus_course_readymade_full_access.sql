-- Root cause fix: get_exam_questions_start (and create_custom_exam) never
-- checked courses.readymade_full_access when resolving access via the
-- recursive linked_course_ids (bonus course) chain. The frontend
-- (TakeExam.tsx) DOES check readymade_full_access, so a bonus/linked course
-- with that flag on would show as accessible in the UI but the actual
-- question-fetch RPC would still deny it ("You are not enrolled..."),
-- because the RPC only matched course_id / shared_course_ids /
-- readymade_course_ids, not the full-access toggle.
--
-- This migration makes both RPCs check readymade_full_access on every
-- accessible course (direct + bonus/linked, via the same recursive CTE)
-- for is_readymade exams, matching the frontend logic exactly.

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text,
  question_index integer, subject text, is_segment_mandatory boolean
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
          JOIN public.courses c ON c.id = aac.course_id
          WHERE
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
            OR
            -- Course-level bulk grant: any accessible course (direct or bonus/linked)
            -- with readymade_full_access = true unlocks EVERY readymade exam,
            -- matching the frontend's fullAccessCourseIds check in TakeExam.tsx.
            (v_is_readymade IS TRUE AND COALESCE(c.readymade_full_access, false) = true)
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
        COALESCE(q.is_segment_mandatory, true)
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


CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_is_unlocked boolean;
  v_is_admin boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  v_is_admin := public.is_admin();

  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.parent_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected exam % is a split section, not a main readymade exam. Please pick the main exam.', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    v_is_unlocked := v_is_admin OR COALESCE(v_source.is_visible_on_free, false);

    IF NOT v_is_unlocked THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = v_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          JOIN public.courses c ON c.id = aac.course_id
          WHERE
            (v_source.course_id IS NOT NULL AND aac.course_id = v_source.course_id)
            OR
            (v_source.shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.shared_course_ids))
            OR
            (v_source.readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.readymade_course_ids))
            OR
            COALESCE(c.readymade_full_access, false) = true
      ) INTO v_is_unlocked;
    END IF;

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count;
  END LOOP;

  IF v_question_index = 0 THEN
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(v_question_index, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
