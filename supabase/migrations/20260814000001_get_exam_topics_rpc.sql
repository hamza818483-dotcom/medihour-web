-- Lightweight RPC to fetch distinct question topics for a given exam,
-- in question_index order of first appearance, used to render the
-- topic-selection dropdown on Readymade exam cards.

CREATE OR REPLACE FUNCTION public.get_exam_topics(p_exam_id uuid)
RETURNS TABLE(topic text, mcq_count integer)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.topic, COUNT(*)::integer AS mcq_count
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
    AND q.topic IS NOT NULL
    AND q.topic <> ''
  GROUP BY q.topic
  ORDER BY MIN(q.question_index) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_topics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_topics(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_topics(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
