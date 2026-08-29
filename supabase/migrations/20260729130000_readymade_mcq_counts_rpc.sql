-- RPC: get_readymade_mcq_counts
-- Fast server-side aggregation for the subject/chapter MCQ-count badges on
-- the Readymade Exam page. Previously the client fetched every exam row,
-- then paginated through every single exam_questions row (1000/request cap)
-- to count client-side — slow for subjects/chapters with many questions.
-- This does the counting in one SQL aggregate instead.
--
-- p_readymade_topics / p_readymade_categories: optional filters, same as the
-- "selectedParentTopics" / "selectedBoards" filters already used client-side.
-- Pass NULL or empty array to skip a filter.

CREATE OR REPLACE FUNCTION public.get_readymade_mcq_counts(
    p_readymade_topics text[] DEFAULT NULL,
    p_readymade_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_subject_counts jsonb;
    v_chapter_counts jsonb;
    v_subchapter_counts jsonb;
BEGIN
    WITH filtered_exams AS (
        SELECT e.id, e.subject, e.chapter, e.readymade_sub_chapter
        FROM public.exams e
        WHERE e.is_readymade = true
          AND e.is_published = true
          AND (p_readymade_topics IS NULL OR array_length(p_readymade_topics, 1) IS NULL OR e.readymade_topic = ANY(p_readymade_topics))
          AND (p_readymade_categories IS NULL OR array_length(p_readymade_categories, 1) IS NULL OR e.readymade_category = ANY(p_readymade_categories))
    ),
    exam_qcounts AS (
        SELECT fe.id AS exam_id, fe.subject, fe.chapter, fe.readymade_sub_chapter, COUNT(eq.id) AS qcount
        FROM filtered_exams fe
        LEFT JOIN public.exam_questions eq ON eq.exam_id = fe.id
        GROUP BY fe.id, fe.subject, fe.chapter, fe.readymade_sub_chapter
    ),
    subject_totals AS (
        SELECT s AS subject_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq, unnest(eq.subject) AS s
        GROUP BY s
    ),
    chapter_totals AS (
        SELECT eq.chapter AS chapter_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.chapter IS NOT NULL
        GROUP BY eq.chapter
    ),
    subchapter_totals AS (
        SELECT eq.chapter || '||' || eq.readymade_sub_chapter AS key_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.readymade_sub_chapter IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_sub_chapter
    )
    SELECT COALESCE(jsonb_object_agg(subject_name, total), '{}'::jsonb) INTO v_subject_counts FROM subject_totals;

    SELECT COALESCE(jsonb_object_agg(chapter_name, total), '{}'::jsonb) INTO v_chapter_counts FROM chapter_totals;

    SELECT COALESCE(jsonb_object_agg(key_name, total), '{}'::jsonb) INTO v_subchapter_counts FROM subchapter_totals;

    RETURN jsonb_build_object('subject_counts', v_subject_counts, 'chapter_counts', v_chapter_counts, 'subchapter_counts', v_subchapter_counts);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_readymade_mcq_counts(text[], text[]) TO authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON public.exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exams_readymade_published ON public.exams(is_readymade, is_published) WHERE is_readymade = true AND is_published = true;
