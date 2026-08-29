-- When admin edits a question's correct answer (e.g. via a resolved report),
-- existing exam_attempts for that exam were scored against the OLD answer key.
-- This function recalculates score/total_marks for every attempt on the exam
-- that owns the edited question, using the same formula as submit_exam_attempt.

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
    v_question_count INTEGER;
    v_updated_count INTEGER := 0;
BEGIN
    SELECT COALESCE(negative_mark_per_question, 0) INTO v_negative_mark
    FROM public.exams
    WHERE id = p_exam_id;

    SELECT count(*) INTO v_question_count
    FROM public.exam_questions
    WHERE exam_id = p_exam_id;

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
            IF v_question_count >= 100 THEN
                v_deduction := 3;
            ELSIF v_question_count >= 50 THEN
                v_deduction := 1.5;
            ELSIF v_question_count >= 30 THEN
                v_deduction := 1;
            END IF;
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

-- Convenience wrapper: recalculate by question_id (finds the owning exam first).
CREATE OR REPLACE FUNCTION public.recalculate_exam_attempts_for_question(p_question_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exam_id UUID;
BEGIN
    SELECT exam_id INTO v_exam_id FROM public.exam_questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    RETURN public.recalculate_exam_attempts_for_exam(v_exam_id);
END;
$$;
