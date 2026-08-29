-- RPC: search_related_mcqs
-- Lets authenticated users search across ALL exam_questions (any exam) by keyword,
-- so the ATLAS AI chat can surface "related MCQ" results on demand.
-- Respects existing exam_questions RLS (authenticated-only) since it runs as invoker,
-- but is defined as a stable function for a simple ILIKE-based text search.

CREATE OR REPLACE FUNCTION public.search_related_mcqs(
  p_query text,
  p_exclude_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  exam_id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option character(1),
  explanation text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    eq.id,
    eq.exam_id,
    eq.question_text,
    eq.option_a,
    eq.option_b,
    eq.option_c,
    eq.option_d,
    eq.correct_option,
    eq.explanation
  FROM public.exam_questions eq
  WHERE
    (p_exclude_id IS NULL OR eq.id <> p_exclude_id)
    AND p_query IS NOT NULL
    AND length(trim(p_query)) > 1
    AND eq.question_text ILIKE ('%' || trim(p_query) || '%')
  ORDER BY eq.question_index ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.search_related_mcqs(text, uuid, int) TO authenticated;
