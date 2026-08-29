-- Update submit_exam_attempt with updated Second Timer Logic (checking disable_second_timer_deduction)
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb, p_violation_count integer DEFAULT 0, p_time_taken_seconds integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
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
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Calculate Attempt Number based on existing logs
    SELECT count(*) + 1 INTO v_attempt_number
    FROM public.study_activity_logs
    WHERE user_id = v_user_id
    AND activity_type = 'exam'
    AND (metadata->>'exam_id')::UUID = p_exam_id;

    -- Get Exam Details
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end, COALESCE(disable_second_timer_deduction, false)
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end, v_disable_second_timer_deduction
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    -- Determine Attempt Type (Live vs Practice)
    IF v_exam_type = 'live' AND v_time_window_end IS NOT NULL AND now() <= v_time_window_end THEN
        v_attempt_type := 'live';
    ELSE
        v_attempt_type := 'practice';
    END IF;

    -- Delete previous attempts (Scoped to same attempt type)
    DELETE FROM public.exam_attempts
    WHERE exam_id = p_exam_id
    AND profile_id = v_user_id
    AND attempt_type = v_attempt_type;

    -- Calculate Score
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

    -- Second Timer Logic
    SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
        -- Calculate question count for the exam
        SELECT count(*) INTO v_question_count
        FROM public.exam_questions
        WHERE exam_id = p_exam_id;

        -- Use question count for deduction logic
        IF v_question_count >= 100 THEN
            v_deduction := 3;
        ELSIF v_question_count >= 50 THEN
            v_deduction := 1.5;
        ELSE
            v_deduction := 1;
        END IF;
    END IF;

    v_total_score := v_raw_score - v_deduction;

    -- Create Attempt Record
    INSERT INTO public.exam_attempts (
        exam_id,
        profile_id,
        score,
        total_marks,
        started_at,
        submitted_at,
        violation_count,
        answers,
        time_taken_seconds,
        attempt_number,
        attempt_type
    )
    VALUES (
        p_exam_id,
        v_user_id,
        v_total_score,
        v_exam_total_marks,
        now(),
        now(),
        p_violation_count,
        p_answers,
        p_time_taken_seconds,
        v_attempt_number,
        v_attempt_type
    )
    RETURNING id INTO v_attempt_id;

    -- Log Activity
    INSERT INTO public.study_activity_logs (
        user_id,
        activity_type,
        duration_seconds,
        metadata
    ) VALUES (
        v_user_id,
        'exam',
        p_time_taken_seconds,
        jsonb_build_object(
            'exam_id', p_exam_id,
            'attempt_id', v_attempt_id,
            'score', v_total_score,
            'raw_score', v_raw_score,
            'deduction', v_deduction,
            'attempt_number', v_attempt_number,
            'attempt_type', v_attempt_type,
            'is_second_timer', v_is_second_timer,
            'question_count', v_question_count
        )
    );

    RETURN v_attempt_id;
END;
$$;
