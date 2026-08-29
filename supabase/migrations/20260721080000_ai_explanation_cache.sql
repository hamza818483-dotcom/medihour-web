-- Cache AI-generated explanations permanently per question, so the same
-- question is never re-generated for different users or repeat views.
-- This is the key to making "ATLAS AI ব্যাখ্যা" load in 1-2 seconds:
-- the very first time anyone opens it for a question, it's generated and
-- saved here; every subsequent open (by anyone) is an instant DB read.

ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS ai_explanation text,
  ADD COLUMN IF NOT EXISTS ai_explanation_generated_at timestamptz;

-- Function: get cached explanation if present, otherwise return null so the
-- client knows it must generate-and-cache (see save_ai_explanation below).
CREATE OR REPLACE FUNCTION public.get_cached_ai_explanation(p_question_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ai_explanation FROM public.exam_questions WHERE id = p_question_id;
$$;

-- Function: save a freshly-generated explanation back to the cache.
-- Uses SECURITY DEFINER so any authenticated student can populate the
-- shared cache (not just admins), since this is a read-through cache,
-- not user-authored content.
CREATE OR REPLACE FUNCTION public.save_ai_explanation(p_question_id uuid, p_explanation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.exam_questions
  SET ai_explanation = p_explanation,
      ai_explanation_generated_at = now()
  WHERE id = p_question_id
    AND ai_explanation IS NULL; -- never overwrite an existing cached answer
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cached_ai_explanation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_explanation(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_exam_questions_ai_explanation_null
  ON public.exam_questions (id)
  WHERE ai_explanation IS NULL;

-- Also expose ai_explanation through get_student_exam_review so the client
-- gets the cache-check for free with the initial page load (no extra request).
CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id uuid)
RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer, ai_explanation text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
    v_answers JSONB;
BEGIN
    SELECT exam_id, profile_id, answers INTO v_exam_id, v_profile_id, v_answers
    FROM exam_attempts
    WHERE id = p_attempt_id;

    IF v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

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
            q.question_index,
            q.ai_explanation
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
            q.question_index,
            q.ai_explanation
        FROM exam_questions q
        WHERE q.exam_id = v_exam_id
        ORDER BY q.question_index;
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
