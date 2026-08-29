-- Powers the "My Progress & History" report page: for the logged-in student,
-- returns every exam attempt (routine + readymade) joined with exam/course
-- info and the student's rank within that exam's leaderboard, computed via a
-- window function over leaderboard_exam_attempts (avoids N+1 client queries).

CREATE OR REPLACE FUNCTION public.get_my_exam_report()
RETURNS TABLE (
    attempt_id UUID,
    exam_id UUID,
    exam_title TEXT,
    exam_type TEXT,
    is_readymade BOOLEAN,
    readymade_topic TEXT,
    course_name TEXT,
    total_marks NUMERIC,
    score NUMERIC,
    submitted_at TIMESTAMPTZ,
    time_window_start TIMESTAMPTZ,
    rank BIGINT,
    total_participants BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH ranked AS (
        SELECT
            lea.id AS attempt_id,
            lea.exam_id,
            lea.profile_id,
            RANK() OVER (
                PARTITION BY lea.exam_id
                ORDER BY lea.score DESC, lea.time_taken_seconds ASC NULLS LAST, lea.submitted_at ASC
            ) AS rnk,
            COUNT(*) OVER (PARTITION BY lea.exam_id) AS participants
        FROM public.leaderboard_exam_attempts lea
    )
    SELECT
        ea.id AS attempt_id,
        e.id AS exam_id,
        e.title AS exam_title,
        e.exam_type,
        COALESCE(e.is_readymade, false) AS is_readymade,
        e.readymade_topic,
        c.name AS course_name,
        e.total_marks,
        ea.score,
        ea.submitted_at,
        e.time_window_start,
        r.rnk AS rank,
        r.participants AS total_participants
    FROM public.exam_attempts ea
    JOIN public.exams e ON e.id = ea.exam_id
    LEFT JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN ranked r ON r.attempt_id = ea.id
    WHERE ea.profile_id = auth.uid()
    ORDER BY ea.submitted_at DESC NULLS LAST;
END;
$$;
