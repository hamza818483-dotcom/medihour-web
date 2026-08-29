-- Cache question totals by exam so the readymade-counts RPC does not scan
-- public.exam_questions on every request.
--
-- This migration deliberately does not add another exam_id index. The
-- existing index is useful for question retrieval, but it cannot avoid
-- recounting the same rows for every RPC call.

CREATE TABLE public.exam_question_counts (
    exam_id uuid PRIMARY KEY,
    question_count bigint NOT NULL CHECK (question_count >= 0)
);

-- Keep the source stable while it is being backfilled and while the triggers
-- are installed, so no concurrent write can fall between those operations.
LOCK TABLE public.exam_questions IN SHARE MODE;

-- Seed the cache before installing the triggers. This also means the initial
-- backfill does not perform one cache write per existing question.
INSERT INTO public.exam_question_counts (exam_id, question_count)
SELECT exam_id, COUNT(*)
FROM public.exam_questions
GROUP BY exam_id;

ANALYZE public.exam_question_counts;

-- The transition-table triggers aggregate each statement, so bulk question
-- imports update the cache once per exam rather than once per question.
CREATE OR REPLACE FUNCTION public.sync_exam_question_counts_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    INSERT INTO public.exam_question_counts (exam_id, question_count)
    SELECT exam_id, COUNT(*)
    FROM new_rows
    GROUP BY exam_id
    ON CONFLICT (exam_id) DO UPDATE
    SET question_count = public.exam_question_counts.question_count + EXCLUDED.question_count;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_exam_question_counts_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    UPDATE public.exam_question_counts AS cached
    SET question_count = GREATEST(cached.question_count - deleted.question_count, 0)
    FROM (
        SELECT exam_id, COUNT(*) AS question_count
        FROM old_rows
        GROUP BY exam_id
    ) AS deleted
    WHERE cached.exam_id = deleted.exam_id;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_exam_question_counts_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    -- Only an exam_id move changes a cached total. Updates to question text,
    -- explanations, marks, etc. should not touch the cache.
    UPDATE public.exam_question_counts AS cached
    SET question_count = GREATEST(cached.question_count - moved.question_count, 0)
    FROM (
        SELECT old_rows.exam_id, COUNT(*) AS question_count
        FROM old_rows
        JOIN new_rows ON new_rows.id = old_rows.id
        WHERE old_rows.exam_id IS DISTINCT FROM new_rows.exam_id
        GROUP BY old_rows.exam_id
    ) AS moved
    WHERE cached.exam_id = moved.exam_id;

    INSERT INTO public.exam_question_counts (exam_id, question_count)
    SELECT new_rows.exam_id, COUNT(*)
    FROM old_rows
    JOIN new_rows ON new_rows.id = old_rows.id
    WHERE old_rows.exam_id IS DISTINCT FROM new_rows.exam_id
    GROUP BY new_rows.exam_id
    ON CONFLICT (exam_id) DO UPDATE
    SET question_count = public.exam_question_counts.question_count + EXCLUDED.question_count;

    RETURN NULL;
END;
$function$;

CREATE TRIGGER exam_questions_count_after_insert
AFTER INSERT ON public.exam_questions
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_exam_question_counts_after_insert();

CREATE TRIGGER exam_questions_count_after_delete
AFTER DELETE ON public.exam_questions
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_exam_question_counts_after_delete();

CREATE TRIGGER exam_questions_count_after_update
AFTER UPDATE ON public.exam_questions
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_exam_question_counts_after_update();

-- The cache is an internal implementation detail, not a Data API resource.
ALTER TABLE public.exam_question_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_question_counts FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_exam_question_counts_after_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_exam_question_counts_after_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_exam_question_counts_after_update() FROM PUBLIC;

-- Replace the RPC's question-table aggregation with the cache while keeping
-- its existing filters and four-key JSON response unchanged.
CREATE OR REPLACE FUNCTION public.get_readymade_mcq_counts(
    p_readymade_topics text[] DEFAULT NULL,
    p_readymade_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_subject_counts jsonb;
    v_chapter_counts jsonb;
    v_board_counts jsonb;
    v_subchapter_counts jsonb;
BEGIN
    WITH filtered_exams AS (
        SELECT
            e.id,
            e.subject,
            e.chapter,
            e.readymade_category,
            e.readymade_sub_chapter
        FROM public.exams AS e
        WHERE e.is_readymade = true
          AND e.is_published = true
          AND (
              p_readymade_topics IS NULL
              OR array_length(p_readymade_topics, 1) IS NULL
              OR e.readymade_topic = ANY(p_readymade_topics)
          )
          AND (
              p_readymade_categories IS NULL
              OR array_length(p_readymade_categories, 1) IS NULL
              OR e.readymade_category = ANY(p_readymade_categories)
          )
    ),
    exam_qcounts AS (
        SELECT
            fe.id AS exam_id,
            fe.subject,
            fe.chapter,
            fe.readymade_category,
            fe.readymade_sub_chapter,
            COALESCE(eqc.question_count, 0::bigint) AS qcount
        FROM filtered_exams AS fe
        LEFT JOIN public.exam_question_counts AS eqc
            ON eqc.exam_id = fe.id
    ),
    subject_totals AS (
        SELECT s AS subject_name, SUM(eq.qcount) AS total
        FROM exam_qcounts AS eq, unnest(eq.subject) AS s
        GROUP BY s
    ),
    chapter_totals AS (
        SELECT eq.chapter AS chapter_name, SUM(eq.qcount) AS total
        FROM exam_qcounts AS eq
        WHERE eq.chapter IS NOT NULL
        GROUP BY eq.chapter
    ),
    board_totals AS (
        SELECT
            eq.chapter || '||' || eq.readymade_category AS key_name,
            SUM(eq.qcount) AS total
        FROM exam_qcounts AS eq
        WHERE eq.chapter IS NOT NULL
          AND eq.readymade_category IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_category
    ),
    subchapter_totals AS (
        SELECT
            eq.chapter || '||' || eq.readymade_sub_chapter AS key_name,
            SUM(eq.qcount) AS total
        FROM exam_qcounts AS eq
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_readymade_mcq_counts(text[], text[]) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
