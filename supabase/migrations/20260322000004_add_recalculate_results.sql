-- Function to recalculate all scores for an exam if the answer key is updated
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
    v_question_count INTEGER := 0;
    v_disable_second_timer_deduction BOOLEAN := false;
BEGIN
    -- 1. Get Exam Details
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(disable_second_timer_deduction, false)
    INTO v_negative_mark, v_disable_second_timer_deduction
    FROM public.exams
    WHERE id = p_exam_id;

    -- 2. Get Question Count once for second timer logic
    SELECT count(*) INTO v_question_count
    FROM public.exam_questions
    WHERE exam_id = p_exam_id;

    -- 3. Loop through all attempts for this exam
    FOR v_attempt IN SELECT id, profile_id, answers FROM public.exam_attempts WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;
        v_deduction := 0;

        -- 4. Recalculate Raw Score from answers
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

        -- 5. Second Timer Logic
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            IF v_question_count >= 100 THEN
                v_deduction := 3;
            ELSIF v_question_count >= 50 THEN
                v_deduction := 1.5;
            ELSIF v_question_count >= 30 THEN
                v_deduction := 1;
            END IF;
        END IF;

        -- 6. Update the attempt record
        UPDATE public.exam_attempts 
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;
    END LOOP;
END;
$$;

-- Allow admins to execute this
GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO service_role;
