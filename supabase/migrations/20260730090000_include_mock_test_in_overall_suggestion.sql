-- Adds total_mock_test_sessions to get_my_overall_activity_report() — Mock
-- Test attempts (public.mock_exam_attempts) were completely missing from
-- Overall Suggestion, same gap as Quick Practice had before.
-- rank_trend stays exam_attempts-only (same reasoning as Quick Practice):
-- Mock Test's unlimited-pool attempts have mock_exam_id = null and no
-- shared peer pool to rank against.

CREATE OR REPLACE FUNCTION public.get_my_overall_activity_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'rank_trend', '[]'::jsonb,
            'total_exams', 0,
            'total_quick_practice_sessions', 0,
            'total_mock_test_sessions', 0,
            'total_watch_seconds', 0,
            'avg_percentile', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT
            a.id,
            a.exam_id,
            a.score,
            COALESCE(a.submitted_at, a.started_at, a.created_at) AS attempt_date
        FROM public.exam_attempts a
        WHERE a.profile_id = v_user_id
    ),
    ranks AS (
        SELECT
            ma.id,
            ma.exam_id,
            ma.attempt_date,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id AND ea.score > ma.score
            ) AS rank,
            (
                SELECT COUNT(*)
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id
            ) AS total_participants
        FROM my_attempts ma
    ),
    rank_trend_rows AS (
        SELECT
            r.attempt_date,
            r.rank,
            r.total_participants,
            CASE WHEN r.total_participants > 1
                 THEN ROUND((1 - ((r.rank - 1)::numeric / NULLIF(r.total_participants - 1, 0))) * 100, 1)
                 ELSE 100
            END AS percentile
        FROM ranks r
        ORDER BY r.attempt_date ASC
    ),
    watch_total AS (
        SELECT COALESCE(SUM(watched_seconds), 0) AS total_seconds
        FROM public.class_watch_sessions
        WHERE profile_id = v_user_id
    ),
    qp_total AS (
        SELECT COUNT(*) AS total_sessions
        FROM public.qp_attempts
        WHERE user_id = v_user_id
    ),
    mock_total AS (
        SELECT COUNT(*) AS total_sessions
        FROM public.mock_exam_attempts
        WHERE user_id = v_user_id AND submitted_at IS NOT NULL
    )
    SELECT jsonb_build_object(
        'rank_trend', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', attempt_date,
                'rank', rank,
                'total_participants', total_participants,
                'percentile', percentile
            ))
            FROM rank_trend_rows
        ), '[]'::jsonb),
        'total_exams', (SELECT COUNT(*) FROM my_attempts),
        'total_quick_practice_sessions', (SELECT total_sessions FROM qp_total),
        'total_mock_test_sessions', (SELECT total_sessions FROM mock_total),
        'total_watch_seconds', (SELECT total_seconds FROM watch_total),
        'avg_percentile', COALESCE((SELECT ROUND(AVG(percentile), 1) FROM rank_trend_rows), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_overall_activity_report() TO authenticated;
