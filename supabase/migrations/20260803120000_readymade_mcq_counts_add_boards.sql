-- Extend get_readymade_mcq_counts to also return board/category-level MCQ
-- counts (keyed "chapter||readymade_category"), so the Board/Category cards
-- on the Readymade Exam page can show an MCQ badge like Chapter/Sub-chapter
-- cards already do.

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
    v_board_counts jsonb;
    v_subchapter_counts jsonb;
BEGIN
    WITH filtered_exams AS (
        SELECT e.id, e.subject, e.chapter, e.readymade_category, e.readymade_sub_chapter
        FROM public.exams e
        WHERE e.is_readymade = true
          AND e.is_published = true
          AND (p_readymade_topics IS NULL OR array_length(p_readymade_topics, 1) IS NULL OR e.readymade_topic = ANY(p_readymade_topics))
          AND (p_readymade_categories IS NULL OR array_length(p_readymade_categories, 1) IS NULL OR e.readymade_category = ANY(p_readymade_categories))
    ),
    exam_qcounts AS (
        SELECT fe.id AS exam_id, fe.subject, fe.chapter, fe.readymade_category, fe.readymade_sub_chapter, COUNT(eq.id) AS qcount
        FROM filtered_exams fe
        LEFT JOIN public.exam_questions eq ON eq.exam_id = fe.id
        GROUP BY fe.id, fe.subject, fe.chapter, fe.readymade_category, fe.readymade_sub_chapter
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
    board_totals AS (
        SELECT eq.chapter || '||' || eq.readymade_category AS key_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.chapter IS NOT NULL AND eq.readymade_category IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_category
    ),
    subchapter_totals AS (
        SELECT eq.chapter || '||' || eq.readymade_sub_chapter AS key_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.readymade_sub_chapter IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_sub_chapter
    )
    SELECT
        (SELECT COALESCE(jsonb_object_agg(subject_name, total), '{}'::jsonb) FROM subject_totals),
        (SELECT COALESCE(jsonb_object_agg(chapter_name, total), '{}'::jsonb) FROM chapter_totals),
        (SELECT COALESCE(jsonb_object_agg(key_name, total), '{}'::jsonb) FROM board_totals),
        (SELECT COALESCE(jsonb_object_agg(key_name, total), '{}'::jsonb) FROM subchapter_totals)
    INTO v_subject_counts, v_chapter_counts, v_board_counts, v_subchapter_counts;

    RETURN jsonb_build_object(
        'subject_counts', v_subject_counts,
        'chapter_counts', v_chapter_counts,
        'board_counts', v_board_counts,
        'subchapter_counts', v_subchapter_counts
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_readymade_mcq_counts(text[], text[]) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
