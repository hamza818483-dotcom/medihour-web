-- Add topic/subtopic columns to get_exam_questions_practice so the
-- Practice Sheet PDF (style1/style2) can group questions by topic with
-- a colored segment header, instead of flat numbering with no grouping.
DROP FUNCTION IF EXISTS public.get_exam_questions_practice(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  option_e text,
  correct_option text,
  explanation text,
  question_index integer,
  topic text,
  subtopic text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_is_readymade boolean;
  v_parent_exam_id uuid;
  v_split_start integer;
  v_split_end integer;
  v_source_exam_id uuid;
BEGIN
  SELECT ex.is_readymade, ex.parent_exam_id, ex.split_start, ex.split_end
  INTO v_is_readymade, v_parent_exam_id, v_split_start, v_split_end
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_source_exam_id := COALESCE(v_parent_exam_id, p_exam_id);

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.option_e,
    q.correct_option::text,
    q.explanation,
    q.question_index,
    q.topic,
    q.subtopic
  FROM public.exam_questions q
  WHERE q.exam_id = v_source_exam_id
    AND (v_parent_exam_id IS NULL OR q.question_index BETWEEN v_split_start AND v_split_end)
  ORDER BY q.question_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;
