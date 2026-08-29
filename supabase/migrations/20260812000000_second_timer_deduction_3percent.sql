-- Change 2nd Timer deduction from tiered fixed marks (1 / 1.5 / 3 based on
-- question count) to a flat 3% cut of the exam's TOTAL MCQ marks (not raw
-- score), for every exam.
-- Applies to: submit_exam_attempt (guest-aware version), recalculate_exam_results,
-- recalculate_exam_attempts_for_exam.

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
            -- Flat 3% deduction of the exam's total marks
            v_deduction := v_exam_total_marks * 0.03;
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
                'attempt_type', v_attempt_type, 'is_second_timer', v_is_second_timer
            )
        );
    END IF;

    RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.recalculate_exam_results(p_exam_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_attempt record;
    v_answer record;
    v_raw_score NUMERIC := 0;
    v_negative_mark NUMERIC;
    v_is_second_timer BOOLEAN;
    v_question_marks NUMERIC;
    v_correct_option TEXT;
    v_deduction NUMERIC := 0;
    v_exam_total_marks NUMERIC;
    v_disable_second_timer_deduction BOOLEAN := false;
BEGIN
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(disable_second_timer_deduction, false), COALESCE(total_marks, 0)
    INTO v_negative_mark, v_disable_second_timer_deduction, v_exam_total_marks
    FROM public.exams
    WHERE id = p_exam_id;

    FOR v_attempt IN SELECT id, profile_id, answers FROM public.exam_attempts WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;
        v_deduction := 0;

        FOR v_answer IN SELECT * FROM jsonb_to_recordset(v_attempt.answers) AS x(question_id UUID, selected_option TEXT)
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

        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            v_deduction := v_exam_total_marks * 0.03;
        END IF;

        UPDATE public.exam_attempts
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.recalculate_exam_attempts_for_exam(p_exam_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_negative_mark NUMERIC;
    v_attempt RECORD;
    v_answer RECORD;
    v_correct_option TEXT;
    v_question_marks NUMERIC;
    v_raw_score NUMERIC;
    v_deduction NUMERIC;
    v_is_second_timer BOOLEAN;
    v_exam_total_marks NUMERIC;
    v_updated_count INTEGER := 0;
BEGIN
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0) INTO v_negative_mark, v_exam_total_marks
    FROM public.exams
    WHERE id = p_exam_id;

    FOR v_attempt IN
        SELECT id, profile_id, answers
        FROM public.exam_attempts
        WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;

        FOR v_answer IN
            SELECT * FROM jsonb_to_recordset(v_attempt.answers) AS x(question_id UUID, selected_option TEXT)
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

        v_deduction := 0;
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer THEN
            v_deduction := v_exam_total_marks * 0.03;
        END IF;

        UPDATE public.exam_attempts
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN v_updated_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
