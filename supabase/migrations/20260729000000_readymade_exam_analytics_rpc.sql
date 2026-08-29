-- RPC: get_student_readymade_exam_analytics
-- Returns per-exam attempt history (date, time, score, rank) for ALL readymade
-- exams the current user has personally attempted. Used by the new
-- "ReadyMade Exam Report" tab on the Exam Analysis page.
--
-- Rank is computed the same way the live leaderboard does it: count of
-- attempts (for that same exam) with a strictly higher score, +1. Ties are
-- broken the same way the client-side leaderboard does (score desc, then
-- time_taken asc, then submitted_at asc) — for rank *number* purposes ties
-- on score alone are equivalent, so counting strictly-higher scores matches
-- the leaderboard's displayed rank for the tied group's first member.

CREATE OR REPLACE FUNCTION public.get_student_readymade_exam_analytics()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    WITH my_readymade_attempts AS (
        SELECT
            a.id AS attempt_id,
            a.exam_id,
            a.score,
            a.submitted_at,
            a.started_at,
            a.created_at
        FROM public.exam_attempts a
        JOIN public.exams e ON e.id = a.exam_id
        WHERE a.profile_id = v_user_id
          AND e.is_readymade = true
    ),
    my_ranks AS (
        SELECT
            mra.attempt_id,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = mra.exam_id
                  AND ea.score > mra.score
            ) AS rank,
            (
                SELECT COUNT(*)
                FROM public.exam_attempts ea
                WHERE ea.exam_id = mra.exam_id
            ) AS total_participants
        FROM my_readymade_attempts mra
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'attempt_id', mra.attempt_id,
            'exam_id', e.id,
            'title', e.title,
            'subject', e.subject,
            'chapter', e.chapter,
            'total_marks', e.total_marks,
            'score', mra.score,
            'rank', mr.rank,
            'total_participants', mr.total_participants,
            'attempt_date', COALESCE(mra.submitted_at, mra.started_at, mra.created_at)
        ) ORDER BY COALESCE(mra.submitted_at, mra.started_at, mra.created_at) DESC
    ) INTO v_result
    FROM my_readymade_attempts mra
    JOIN public.exams e ON e.id = mra.exam_id
    JOIN my_ranks mr ON mr.attempt_id = mra.attempt_id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_readymade_exam_analytics() TO authenticated;
