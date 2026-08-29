-- create_custom_exam was missing sub-chapter-level access grants
-- (course_readymade_access table), so users who only had sub-chapter grants
-- (not full course/shared/readymade enrollment) got "You are not enrolled
-- for exam %" even though the Readymade page showed the exam as unlocked.
-- Mirrors isExamUnlocked() in Readymade.tsx / CustomExamBuilder.tsx.

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
  v_chapter text;
  v_sub_chapter text;
  v_subject text;
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
          WHERE
            (v_source.course_id IS NOT NULL AND aac.course_id = v_source.course_id)
            OR
            (v_source.shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.shared_course_ids))
            OR
            (v_source.readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.readymade_course_ids))
      ) INTO v_is_unlocked;
    END IF;

    -- Sub-chapter-level grant fallback (course_readymade_access), mirrors
    -- the frontend's isExamUnlocked() sub-chapter check.
    IF NOT v_is_unlocked THEN
      v_chapter := COALESCE(v_source.chapter, 'সাধারণ');
      v_sub_chapter := COALESCE(v_source.readymade_sub_chapter, 'সাধারণ');

      SELECT EXISTS (
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
        SELECT 1
        FROM public.course_readymade_access gr
        JOIN all_accessible_courses aac ON aac.course_id = gr.course_id
        WHERE gr.mode = 'readymade'
          AND gr.chapter = v_chapter
          AND gr.sub_chapter = v_sub_chapter
          AND gr.subject = ANY(
            CASE
              WHEN v_source.subject IS NULL THEN ARRAY[]::text[]
              ELSE v_source.subject
            END
          )
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
      duration_minutes = GREATEST(CEIL(v_question_index * 0.5)::int, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;
