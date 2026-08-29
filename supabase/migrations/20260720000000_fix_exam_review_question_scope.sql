-- Fix get_student_exam_review to only return questions that were part of the attempt
-- (relevant for readymade exams where the student picks a subset of MCQs).
-- Previously this returned ALL questions in exam_questions for the exam,
-- causing the review/result page to show the full question bank instead of
-- just the questions the student actually attempted.

CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id uuid)
RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
    v_answers JSONB;
BEGIN
    -- Get exam_id, profile_id and answers from attempt
    SELECT exam_id, profile_id, answers INTO v_exam_id, v_profile_id, v_answers
    FROM exam_attempts
    WHERE id = p_attempt_id;

    -- Check if the user is the owner of the attempt
    IF v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- If the attempt has a recorded answers list, scope the review to only
    -- those question ids (handles readymade exams with a subset of MCQs).
    -- If answers is null/empty (edge case), fall back to full exam question list.
    IF v_answers IS NOT NULL AND jsonb_typeof(v_answers) = 'array' AND jsonb_array_length(v_answers) > 0 THEN
        RETURN QUERY
        SELECT
            q.id as question_id,
            q.question_text,
            q.option_a,
            q.option_b,
            q.option_c,
            q.option_d,
            q.correct_option::TEXT,
            q.marks,
            q.explanation,
            q.question_index
        FROM exam_questions q
        WHERE q.exam_id = v_exam_id
        AND q.id IN (
            SELECT (x->>'question_id')::UUID
            FROM jsonb_array_elements(v_answers) AS x
        )
        ORDER BY q.question_index;
    ELSE
        RETURN QUERY
        SELECT
            q.id as question_id,
            q.question_text,
            q.option_a,
            q.option_b,
            q.option_c,
            q.option_d,
            q.correct_option::TEXT,
            q.marks,
            q.explanation,
            q.question_index
        FROM exam_questions q
        WHERE q.exam_id = v_exam_id
        ORDER BY q.question_index;
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
