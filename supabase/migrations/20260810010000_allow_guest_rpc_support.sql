-- Extend guest-access RPCs so any exam with allow_guest = true works for
-- anonymous visitors exactly like is_visible_on_free exams do — same
-- get_exam_questions_start / submit_exam_attempt flow, just an additional
-- OR condition on the access check.

DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text, question_index integer)
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
        q.question_index
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

-- submit_exam_attempt: same signature, only the guest-eligibility check changes.
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
    p_exam_id uuid,
    p_answers jsonb,
    p_violation_count integer DEFAULT 0,
    p_time_taken_seconds integer DEFAULT 0,
    p_guest_name text DEFAULT NULL,
    p_guest_hsc_batch text DEFAULT NULL,
    p_guest_college_name text DEFAULT NULL,
    p_guest_phone text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_guest BOOLEAN := false;
    v_attempt_id UUID;
    v_total_score NUMERIC := 0;
    v_raw_score NUMERIC := 0;
    v_negative_mark NUMERIC;
    v_exam_total_marks NUMERIC;
    v_is_second_timer BOOLEAN;
    v_answer RECORD;
    v_correct_option TEXT;
    v_question_marks NUMERIC;
    v_deduction NUMERIC := 0;
    v_attempt_number INTEGER;
    v_exam_type TEXT;
    v_time_window_end TIMESTAMPTZ;
    v_attempt_type TEXT := 'practice';
    v_question_count INTEGER := 0;
    v_disable_second_timer_deduction BOOLEAN := false;
    v_is_visible_on_free BOOLEAN;
    v_allow_guest BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        IF p_guest_name IS NULL OR p_guest_phone IS NULL THEN
            RAISE EXCEPTION 'Not authenticated';
        END IF;
        v_is_guest := true;
    END IF;

    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end, COALESCE(disable_second_timer_deduction, false), COALESCE(is_visible_on_free, false), COALESCE(allow_guest, false)
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end, v_disable_second_timer_deduction, v_is_visible_on_free, v_allow_guest
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    IF v_is_guest AND NOT (v_is_visible_on_free OR v_allow_guest) THEN
        RAISE EXCEPTION 'Login required for this exam';
    END IF;

    IF v_exam_type = 'live' AND v_time_window_end IS NOT NULL AND now() <= v_time_window_end THEN
        v_attempt_type := 'live';
    ELSE
        v_attempt_type := 'practice';
    END IF;

    IF NOT v_is_guest THEN
        SELECT count(*) + 1 INTO v_attempt_number
        FROM public.study_activity_logs
        WHERE user_id = v_user_id
        AND activity_type = 'exam'
        AND (metadata->>'exam_id')::UUID = p_exam_id;

        DELETE FROM public.exam_attempts
        WHERE exam_id = p_exam_id
        AND profile_id = v_user_id
        AND attempt_type = v_attempt_type;
    END IF;

    FOR v_answer IN SELECT * FROM jsonb_to_recordset(p_answers) AS x(question_id UUID, selected_option TEXT)
    LOOP
        SELECT correct_option, COALESCE(marks, 1) INTO v_correct_option, v_question_marks
        FROM public.exam_questions
        WHERE id = v_answer.question_id;

        IF FOUND THEN
            IF v_answer.selected_option = v_correct_option THEN
                v_raw_score := v_raw_score + v_question_marks;
            ELSIF v_answer.selected_option IS NOT NULL AND v_answer.selected_option <> '' THEN
                v_raw_score := v_raw_score - v_negative_mark;
            END IF;
        END IF;
    END LOOP;

    IF NOT v_is_guest THEN
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_user_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            SELECT count(*) INTO v_question_count
            FROM public.exam_questions
            WHERE exam_id = p_exam_id;

            IF v_question_count >= 100 THEN
                v_deduction := 3;
            ELSIF v_question_count >= 50 THEN
                v_deduction := 1.5;
            ELSIF v_question_count >= 30 THEN
                v_deduction := 1;
            END IF;
        END IF;
    END IF;

    v_total_score := v_raw_score - v_deduction;

    INSERT INTO public.exam_attempts (
        exam_id, profile_id, score, total_marks, started_at, submitted_at,
        violation_count, answers, time_taken_seconds, attempt_number, attempt_type,
        guest_name, guest_hsc_batch, guest_college_name, guest_phone
    )
    VALUES (
        p_exam_id, v_user_id, v_total_score, v_total_score, now(), now(),
        p_violation_count, p_answers, p_time_taken_seconds, v_attempt_number, v_attempt_type,
        CASE WHEN v_is_guest THEN p_guest_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_hsc_batch ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_college_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_phone ELSE NULL END
    )
    RETURNING id INTO v_attempt_id;

    IF NOT v_is_guest THEN
        INSERT INTO public.study_activity_logs (user_id, activity_type, duration_seconds, metadata)
        VALUES (
            v_user_id, 'exam', p_time_taken_seconds,
            jsonb_build_object(
                'exam_id', p_exam_id, 'attempt_id', v_attempt_id, 'score', v_total_score,
                'raw_score', v_raw_score, 'deduction', v_deduction, 'attempt_number', v_attempt_number,
                'attempt_type', v_attempt_type, 'is_second_timer', v_is_second_timer, 'question_count', v_question_count
            )
        );
    END IF;

    RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
