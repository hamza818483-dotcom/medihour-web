-- get_student_exam_review: explicitly allow guest attempts (profile_id IS
-- NULL, i.e. Free Exam attempts taken without login) to be reviewed by
-- anyone holding the attempt id — same as how a guest already gets their
-- result link right after submitting. Logged-in-owner check is unchanged.

-- Postgres refuses CREATE OR REPLACE when the OUT-parameter row type
-- differs from an existing overload with the same signature in some
-- environments — drop first to guarantee a clean redefine.
DROP FUNCTION IF EXISTS public.get_student_exam_review(uuid);

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

    -- Ownership check: a logged-in attempt (profile_id set) must belong to
    -- the caller. A guest attempt (profile_id IS NULL, Free Exam without
    -- login) has no owner to check against — the attempt id itself (a UUID,
    -- effectively unguessable) is the access token, same as the public
    -- exam-review link a guest is handed right after submitting.
    IF v_profile_id IS NOT NULL AND v_profile_id != auth.uid() THEN
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

GRANT EXECUTE ON FUNCTION public.get_student_exam_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_exam_review(uuid) TO anon;

NOTIFY pgrst, 'reload schema';
