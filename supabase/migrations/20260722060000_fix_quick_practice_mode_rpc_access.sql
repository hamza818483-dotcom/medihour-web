-- Fix: get_exam_questions_practice was blocking valid users with an overly
-- strict enrollment/course check that doesn't match the actual access model.
-- Real RLS on exam_questions allows any authenticated user to view questions
-- of a published exam (or any exam_questions row at all, via the broader
-- "Authenticated users can view exam questions" policy). Quick Practice is
-- restricted to readymade exams only, so we align: any authenticated user
-- may fetch practice data for a readymade exam.

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  explanation text,
  question_index integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_is_readymade boolean;
BEGIN
  SELECT ex.is_readymade
  INTO v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.correct_option::text,
    q.explanation,
    q.question_index
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
  ORDER BY q.question_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;
