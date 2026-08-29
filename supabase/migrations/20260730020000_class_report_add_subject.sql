-- Adds `subject` (text[]) to get_my_class_report() output so the Class
-- Weakness Report can aggregate total watched time per subject and flag
-- subjects with comparatively low watch time. Everything else unchanged.

CREATE OR REPLACE FUNCTION public.get_my_class_report()
RETURNS TABLE (
    class_id UUID,
    class_title TEXT,
    category TEXT,
    course_name TEXT,
    class_start_at TIMESTAMPTZ,
    total_watched_seconds BIGINT,
    last_watched_at TIMESTAMPTZ,
    rank BIGINT,
    total_participants BIGINT,
    subject TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH per_student_totals AS (
        SELECT
            cws.profile_id,
            cws.class_id,
            cws.category,
            SUM(cws.watched_seconds) AS total_seconds,
            MAX(cws.last_watched_at) AS last_watched
        FROM public.class_watch_sessions cws
        GROUP BY cws.profile_id, cws.class_id, cws.category
    ),
    ranked AS (
        SELECT
            pst.*,
            RANK() OVER (
                PARTITION BY pst.class_id, pst.category
                ORDER BY pst.total_seconds DESC
            ) AS rnk,
            COUNT(*) OVER (PARTITION BY pst.class_id, pst.category) AS participants
        FROM per_student_totals pst
    )
    SELECT
        c.id AS class_id,
        c.title AS class_title,
        r.category,
        co.name AS course_name,
        c.start_at AS class_start_at,
        r.total_seconds AS total_watched_seconds,
        r.last_watched AS last_watched_at,
        r.rnk AS rank,
        r.participants AS total_participants,
        c.subject AS subject
    FROM ranked r
    JOIN public.classes c ON c.id = r.class_id
    LEFT JOIN public.courses co ON co.id = c.course_id
    WHERE r.profile_id = auth.uid()
    ORDER BY r.last_watched DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_class_report() TO authenticated;
