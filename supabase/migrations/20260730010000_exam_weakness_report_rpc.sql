-- Powers "Exam Weakness Report" inside My Weak Topic and Analysis.
-- Combines every exam-taking surface (routine Live, routine Practice,
-- Readymade Exam, Quick Practice, Unlimited Mock Test — all of these write
-- into exam_attempts + exam_answers the same way) into one per-subject and
-- per-chapter accuracy breakdown for the logged-in student, plus a daily
-- score trend so the UI can apply its own day-range filter.
--
-- Rule-based (no AI): a subject/chapter is "weak" purely by comparing its
-- accuracy % against the student's own overall accuracy % — the frontend
-- decides the exact threshold/labels.

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
            'subjects', '[]'::jsonb,
            'chapters', '[]'::jsonb,
            'daily', '[]'::jsonb,
            'question_types', '[]'::jsonb,
            'overall_accuracy', 0,
            'total_answered', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT id, exam_id, submitted_at, started_at, created_at
        FROM public.exam_attempts
        WHERE profile_id = v_user_id
    ),
    my_answers AS (
        SELECT
            ea.attempt_id,
            ea.question_id,
            ea.is_correct,
            ma.exam_id,
            COALESCE(ma.submitted_at, ma.started_at, ma.created_at) AS answer_date
        FROM public.exam_answers ea
        JOIN my_attempts ma ON ma.id = ea.attempt_id
        WHERE ea.is_correct IS NOT NULL
    ),
    -- One row per answer, unnested across each exam's subject array so a
    -- multi-subject exam contributes to every one of its subjects.
    answers_by_subject AS (
        SELECT
            mya.is_correct,
            mya.answer_date,
            subj AS subject_name
        FROM my_answers mya
        JOIN public.exams e ON e.id = mya.exam_id
        CROSS JOIN LATERAL unnest(
            CASE WHEN e.subject IS NULL OR array_length(e.subject, 1) IS NULL
                 THEN ARRAY['Uncategorized']
                 ELSE e.subject
            END
        ) AS subj
    ),
    answers_by_chapter AS (
        SELECT
            mya.is_correct,
            mya.answer_date,
            COALESCE(e.chapter, 'Uncategorized') AS chapter_name,
            COALESCE(e.subject[1], 'Uncategorized') AS subject_name
        FROM my_answers mya
        JOIN public.exams e ON e.id = mya.exam_id
    ),
    answers_by_qtype AS (
        SELECT
            mya.is_correct,
            COALESCE(eq.question_type, 'General') AS question_type
        FROM my_answers mya
        JOIN public.exam_questions eq ON eq.id = mya.question_id
    ),
    subject_stats AS (
        SELECT
            subject_name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_subject
        GROUP BY subject_name
    ),
    chapter_stats AS (
        SELECT
            subject_name,
            chapter_name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_chapter
        GROUP BY subject_name, chapter_name
    ),
    qtype_stats AS (
        SELECT
            question_type,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_qtype
        GROUP BY question_type
    ),
    daily_stats AS (
        SELECT
            answer_date::date AS day,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers
        GROUP BY answer_date::date
    ),
    overall AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers
    )
    SELECT jsonb_build_object(
        'subjects', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM subject_stats
        ), '[]'::jsonb),
        'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name,
                'chapter', chapter_name,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM chapter_stats
        ), '[]'::jsonb),
        'question_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'question_type', question_type,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM qtype_stats
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', day,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY day ASC)
            FROM daily_stats
        ), '[]'::jsonb),
        'overall_accuracy', COALESCE((SELECT ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1) FROM overall), 0),
        'total_answered', COALESCE((SELECT total FROM overall), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_exam_weakness_report() TO authenticated;
