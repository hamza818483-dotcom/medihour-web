-- Powers "Class Report" inside My Progress & History: tracks how long each
-- student watches each class (live / recorded / archive), and lets us show
-- per-class watched-duration plus a rank (by watched duration) among peers.

CREATE TABLE IF NOT EXISTS public.class_watch_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('live', 'record', 'archive')),
    watched_seconds INTEGER NOT NULL DEFAULT 0,
    watch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One row per student per class per day per category, so re-watching the
    -- same class across multiple days accumulates as separate daily entries
    -- (useful for the day-range graph) while the same day's sessions merge.
    UNIQUE (profile_id, class_id, category, watch_date)
);

CREATE INDEX IF NOT EXISTS idx_class_watch_sessions_profile ON public.class_watch_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_class_watch_sessions_class ON public.class_watch_sessions(class_id);

ALTER TABLE public.class_watch_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watch sessions"
    ON public.class_watch_sessions FOR SELECT
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own watch sessions"
    ON public.class_watch_sessions FOR INSERT
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own watch sessions"
    ON public.class_watch_sessions FOR UPDATE
    USING (auth.uid() = profile_id);

-- Called periodically (e.g. every 30-60s while playing, and on unmount) from
-- ClassPlayer with an incremental number of seconds watched. Accumulates
-- into today's row for that student+class+category rather than overwriting.
CREATE OR REPLACE FUNCTION public.log_class_watch_time(
    p_class_id UUID,
    p_category TEXT,
    p_seconds INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.class_watch_sessions (profile_id, class_id, category, watched_seconds, watch_date, last_watched_at)
    VALUES (auth.uid(), p_class_id, p_category, GREATEST(p_seconds, 0), CURRENT_DATE, now())
    ON CONFLICT (profile_id, class_id, category, watch_date)
    DO UPDATE SET
        watched_seconds = public.class_watch_sessions.watched_seconds + GREATEST(p_seconds, 0),
        last_watched_at = now();
END;
$$;

-- Report RPC: for the logged-in student, returns one row per class they've
-- watched (summed across days), with title/date/category and their rank by
-- total watched_seconds among all students who watched that same class in
-- that same category.
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
    total_participants BIGINT
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
        r.participants AS total_participants
    FROM ranked r
    JOIN public.classes c ON c.id = r.class_id
    LEFT JOIN public.courses co ON co.id = c.course_id
    WHERE r.profile_id = auth.uid()
    ORDER BY r.last_watched DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_class_watch_time(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_report() TO authenticated;
