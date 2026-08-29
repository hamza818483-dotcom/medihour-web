-- Extends get_my_exam_weakness_report() to also fold in Quick Practice
-- attempts (public.qp_attempts), which is a completely separate system
-- from exam_attempts/exams and was previously NOT included — meaning
-- subject/chapter weakness only reflected Live/Practice/Readymade exams,
-- not Quick Practice sessions. Each qp_attempts row's `details` jsonb array
-- already carries subject_name/chapter_name/correct per question, so it
-- merges in directly without needing exam_questions.

CREATE OR REPLACE FUNCTION public.get_my_exam_weakness_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'subjects', '[]'::jsonb, 'chapters', '[]'::jsonb, 'daily', '[]'::jsonb,
            'question_types', '[]'::jsonb, 'overall_accuracy', 0, 'total_answered', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT id, exam_id, answers, COALESCE(submitted_at, started_at, created_at) AS attempt_date
        FROM public.exam_attempts
        WHERE profile_id = v_user_id AND answers IS NOT NULL
    ),
    -- Routine/Readymade exam answers (Live, Practice, Readymade — everything
    -- that flows through exam_attempts/submit_exam_attempt).
    exam_answers_expanded AS (
        SELECT
            ma.attempt_date,
            (ans->>'question_id')::uuid AS question_id,
            (ans->>'selected_option') AS selected_option,
            eq.correct_option,
            eq.question_type,
            (ans->>'selected_option') IS NOT NULL
                AND (ans->>'selected_option') = eq.correct_option::text AS is_correct,
            CASE WHEN e.subject IS NULL OR array_length(e.subject, 1) IS NULL
                 THEN ARRAY['Uncategorized'] ELSE e.subject END AS subjects,
            COALESCE(e.chapter, 'Uncategorized') AS chapter_name
        FROM my_attempts ma
        CROSS JOIN LATERAL jsonb_array_elements(ma.answers) AS ans
        JOIN public.exam_questions eq ON eq.id = (ans->>'question_id')::uuid
        JOIN public.exams e ON e.id = ma.exam_id
        WHERE (ans->>'selected_option') IS NOT NULL
    ),
    -- Quick Practice attempts (separate qp_attempts system — each `details`
    -- element already has subject_name/chapter_name/correct baked in).
    qp_answers_expanded AS (
        SELECT
            qa.created_at AS attempt_date,
            (d->>'correct')::boolean AS is_correct,
            'MCQ'::text AS question_type,
            ARRAY[COALESCE(d->>'subject_name', 'Uncategorized')] AS subjects,
            COALESCE(d->>'chapter_name', 'Uncategorized') AS chapter_name
        FROM public.qp_attempts qa
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qa.details, '[]'::jsonb)) AS d
        WHERE qa.user_id = v_user_id
    ),
    -- Unified per-answer rows across BOTH sources.
    my_answers AS (
        SELECT attempt_date, is_correct, question_type, subjects, chapter_name FROM exam_answers_expanded
        UNION ALL
        SELECT attempt_date, is_correct, question_type, subjects, chapter_name FROM qp_answers_expanded
    ),
    answers_by_subject AS (
        SELECT mya.is_correct, mya.attempt_date, subj AS subject_name
        FROM my_answers mya
        CROSS JOIN LATERAL unnest(mya.subjects) AS subj
    ),
    answers_by_chapter AS (
        SELECT is_correct, attempt_date, chapter_name, subjects[1] AS subject_name
        FROM my_answers
    ),
    answers_by_qtype AS (
        SELECT is_correct, COALESCE(question_type, 'General') AS question_type
        FROM my_answers
    ),
    subject_stats AS (
        SELECT subject_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_subject GROUP BY subject_name
    ),
    chapter_stats AS (
        SELECT subject_name, chapter_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_chapter GROUP BY subject_name, chapter_name
    ),
    qtype_stats AS (
        SELECT question_type, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_qtype GROUP BY question_type
    ),
    daily_stats AS (
        SELECT attempt_date::date AS day, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers GROUP BY attempt_date::date
    ),
    overall AS (
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct FROM my_answers
    )
    SELECT jsonb_build_object(
        'subjects', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM subject_stats
        ), '[]'::jsonb),
        'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'chapter', chapter_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM chapter_stats
        ), '[]'::jsonb),
        'question_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'question_type', question_type, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM qtype_stats
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', day, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY day ASC) FROM daily_stats
        ), '[]'::jsonb),
        'overall_accuracy', COALESCE((SELECT ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1) FROM overall), 0),
        'total_answered', COALESCE((SELECT total FROM overall), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_exam_weakness_report() TO authenticated;
