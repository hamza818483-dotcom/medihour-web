-- Adds a second-level `subtopic` grouping under each per-question `topic`,
-- so a Readymade exam card's topic list can expand into a subtopic dropdown
-- (e.g. CSV imported with topic="Vector" + subtopic="Addition") instead of
-- navigating straight to take-exam on topic click alone.

ALTER TABLE public.exam_questions
ADD COLUMN IF NOT EXISTS subtopic text;

-- Replaces get_exam_topics with a tree-shaped version: each row is either
-- a topic with subtopic = NULL (no subtopics under it -- old behavior,
-- click goes straight to take-exam) or a topic+subtopic pair (dropdown
-- entry). mcq_count is per subtopic when subtopic is present, otherwise
-- per whole topic. Ordered by first appearance (question_index) at both
-- levels, matching how /qbm's topic-wise CSV lays out segments.
CREATE OR REPLACE FUNCTION public.get_exam_topic_tree(p_exam_id uuid)
RETURNS TABLE(topic text, subtopic text, mcq_count integer, first_index integer)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.topic, q.subtopic, COUNT(*)::integer AS mcq_count, MIN(q.question_index)::integer AS first_index
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
    AND q.topic IS NOT NULL
    AND q.topic <> ''
  GROUP BY q.topic, q.subtopic
  ORDER BY MIN(q.question_index) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_topic_tree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_topic_tree(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_topic_tree(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
