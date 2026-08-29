-- Powers the Dashboard's "Top Performer" page: a site-wide leaderboard
-- ranking every enrolled user by a composite activity+performance score,
-- computed separately for each day-range (today, 3/7/15/30 days).
--
-- Composite score weighting (out of 100), exam performance weighted highest
-- per product decision ("exam er beparta beshi priority pabe"):
--   40% — average exam score percentage (score/total_marks), rewards higher marks
--   20% — exam volume (how many exams attempted, log-scaled so 1 huge outlier
--         doesn't dominate over someone who attempted many exams consistently)
--   15% — regularity (distinct active days / days in period)
--   15% — focus timer total duration (site-wide leaderboard already tracks this)
--   10% — class watch time
-- Tie-breaker after composite score: same average score → whoever averaged
-- LESS time per question wins (faster + accurate ranks above slower + accurate).
--
-- All raw numbers are returned alongside the score so the frontend detail
-- view ("বিস্তারিত") can show a full breakdown, not just the final rank.

CREATE OR REPLACE FUNCTION public.get_top_performers(p_days integer DEFAULT 30)
RETURNS TABLE (
    profile_id uuid,
    full_name text,
    avatar_url text,
    exam_count bigint,
    avg_score_pct numeric,
    avg_seconds_per_question numeric,
    class_watch_seconds bigint,
    focus_seconds bigint,
    active_days bigint,
    composite_score numeric,
    rank_position bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start timestamptz;
BEGIN
    v_period_start := CASE
        WHEN p_days <= 0 THEN date_trunc('day', now()) -- "today"
        ELSE now() - (p_days || ' days')::interval
    END;

    RETURN QUERY
    WITH enrolled_users AS (
        SELECT DISTINCT e.profile_id
        FROM public.enrollments e
    ),
    exam_stats AS (
        SELECT
            a.profile_id,
            COUNT(*) AS v_exam_count,
            AVG(CASE WHEN a.total_marks > 0 THEN (a.score / a.total_marks) * 100 ELSE NULL END) AS v_avg_score_pct,
            AVG(
                CASE WHEN a.time_taken_seconds > 0 AND (
                    SELECT COUNT(*) FROM public.exam_questions eq WHERE eq.exam_id = a.exam_id
                ) > 0
                THEN a.time_taken_seconds::numeric / (SELECT COUNT(*) FROM public.exam_questions eq WHERE eq.exam_id = a.exam_id)
                ELSE NULL END
            ) AS v_avg_seconds_per_question,
            COUNT(DISTINCT date_trunc('day', COALESCE(a.submitted_at, a.created_at))) AS v_exam_active_days
        FROM public.exam_attempts a
        WHERE COALESCE(a.submitted_at, a.created_at) >= v_period_start
        GROUP BY a.profile_id
    ),
    class_stats AS (
        SELECT
            cws.profile_id,
            SUM(cws.watched_seconds) AS v_class_watch_seconds,
            COUNT(DISTINCT cws.watch_date) AS v_class_active_days
        FROM public.class_watch_sessions cws
        WHERE cws.watch_date >= v_period_start::date
        GROUP BY cws.profile_id
    ),
    focus_stats AS (
        SELECT
            fs.user_id AS profile_id,
            SUM(fs.duration_seconds) AS v_focus_seconds,
            COUNT(DISTINCT date_trunc('day', fs.started_at)) AS v_focus_active_days
        FROM public.focus_sessions fs
        WHERE fs.started_at >= v_period_start
        GROUP BY fs.user_id
    ),
    combined AS (
        SELECT
            eu.profile_id,
            COALESCE(es.v_exam_count, 0) AS v_exam_count,
            COALESCE(es.v_avg_score_pct, 0) AS v_avg_score_pct,
            es.v_avg_seconds_per_question,
            COALESCE(cs.v_class_watch_seconds, 0) AS v_class_watch_seconds,
            COALESCE(fst.v_focus_seconds, 0) AS v_focus_seconds,
            -- Regularity = distinct days with ANY tracked activity, across all
            -- three sources, capped at the period length itself.
            LEAST(
                GREATEST(COALESCE(es.v_exam_active_days, 0), COALESCE(cs.v_class_active_days, 0), COALESCE(fst.v_focus_active_days, 0)),
                GREATEST(p_days, 1)
            ) AS v_active_days
        FROM enrolled_users eu
        LEFT JOIN exam_stats es ON es.profile_id = eu.profile_id
        LEFT JOIN class_stats cs ON cs.profile_id = eu.profile_id
        LEFT JOIN focus_stats fst ON fst.profile_id = eu.profile_id
    ),
    -- Normalize each raw metric to a 0-100 scale relative to the best
    -- performer in this period, so scales differ (seconds vs count vs %)
    -- without any one metric mechanically dominating.
    bounds AS (
        SELECT
            GREATEST(MAX(v_exam_count), 1) AS max_exam_count,
            GREATEST(MAX(v_class_watch_seconds), 1) AS max_class_seconds,
            GREATEST(MAX(v_focus_seconds), 1) AS max_focus_seconds,
            GREATEST(MAX(v_active_days), 1) AS max_active_days
        FROM combined
    ),
    scored AS (
        SELECT
            c.*,
            -- log-scaled exam volume so one binge day doesn't dwarf steady practice
            (LN(c.v_exam_count + 1) / NULLIF(LN(b.max_exam_count + 1), 0)) * 100 AS exam_volume_norm,
            (c.v_class_watch_seconds::numeric / b.max_class_seconds) * 100 AS class_norm,
            (c.v_focus_seconds::numeric / b.max_focus_seconds) * 100 AS focus_norm,
            (c.v_active_days::numeric / b.max_active_days) * 100 AS regularity_norm
        FROM combined c CROSS JOIN bounds b
    ),
    final AS (
        SELECT
            s.profile_id,
            s.v_exam_count,
            ROUND(s.v_avg_score_pct::numeric, 2) AS v_avg_score_pct,
            ROUND(s.v_avg_seconds_per_question::numeric, 1) AS v_avg_seconds_per_question,
            s.v_class_watch_seconds,
            s.v_focus_seconds,
            s.v_active_days,
            ROUND(
                ((s.v_avg_score_pct * 0.40) +
                (COALESCE(s.exam_volume_norm, 0) * 0.20) +
                (COALESCE(s.regularity_norm, 0) * 0.15) +
                (COALESCE(s.focus_norm, 0) * 0.15) +
                (COALESCE(s.class_norm, 0) * 0.10))::numeric
            , 2) AS v_composite_score
        FROM scored s
    )
    SELECT
        f.profile_id,
        p.full_name,
        p.avatar_url,
        f.v_exam_count,
        f.v_avg_score_pct,
        f.v_avg_seconds_per_question,
        f.v_class_watch_seconds,
        f.v_focus_seconds,
        f.v_active_days,
        f.v_composite_score,
        RANK() OVER (
            ORDER BY f.v_composite_score DESC,
                     f.v_avg_seconds_per_question ASC NULLS LAST -- tie-break: faster-but-equally-accurate ranks higher
        ) AS rank_position
    FROM final f
    JOIN public.profiles p ON p.id = f.profile_id
    ORDER BY rank_position ASC, p.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_performers(integer) TO authenticated;

-- Detail RPC for "বিস্তারিত": per-user breakdown across the fixed set of
-- day-ranges (today, 3/7/15/30/45/60/75/90), each range's start/end date
-- included so the frontend can show "থেকে ... পর্যন্ত" alongside the numbers,
-- plus a category-wise daily activity series (for the requested graph) for
-- the widest range (90 days) so one query covers the whole graph.
CREATE OR REPLACE FUNCTION public.get_my_performance_detail()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_ranges int[] := ARRAY[0, 3, 7, 15, 30, 45, 60, 75, 90];
    v_range int;
    v_period_start timestamptz;
    v_period_end timestamptz := now();
    v_summaries jsonb := '[]'::jsonb;
    v_daily jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('summaries', '[]'::jsonb, 'daily_activity', '[]'::jsonb);
    END IF;

    FOREACH v_range IN ARRAY v_ranges LOOP
        v_period_start := CASE WHEN v_range <= 0 THEN date_trunc('day', now()) ELSE now() - (v_range || ' days')::interval END;

        v_summaries := v_summaries || jsonb_build_object(
            'days', v_range,
            'period_start', v_period_start,
            'period_end', v_period_end,
            'exam_count', (
                SELECT COUNT(*) FROM public.exam_attempts a
                WHERE a.profile_id = v_user_id AND COALESCE(a.submitted_at, a.created_at) >= v_period_start
            ),
            'avg_score_pct', (
                SELECT ROUND(AVG(CASE WHEN a.total_marks > 0 THEN (a.score / a.total_marks) * 100 ELSE NULL END), 2)
                FROM public.exam_attempts a
                WHERE a.profile_id = v_user_id AND COALESCE(a.submitted_at, a.created_at) >= v_period_start
            ),
            'class_watch_seconds', (
                SELECT COALESCE(SUM(watched_seconds), 0) FROM public.class_watch_sessions cws
                WHERE cws.profile_id = v_user_id AND cws.watch_date >= v_period_start::date
            ),
            'focus_seconds', (
                SELECT COALESCE(SUM(duration_seconds), 0) FROM public.focus_sessions fs
                WHERE fs.user_id = v_user_id AND fs.started_at >= v_period_start
            ),
            'active_days', (
                SELECT COUNT(DISTINCT d) FROM (
                    SELECT date_trunc('day', COALESCE(a.submitted_at, a.created_at)) AS d
                    FROM public.exam_attempts a WHERE a.profile_id = v_user_id AND COALESCE(a.submitted_at, a.created_at) >= v_period_start
                    UNION
                    SELECT cws.watch_date::timestamptz AS d
                    FROM public.class_watch_sessions cws WHERE cws.profile_id = v_user_id AND cws.watch_date >= v_period_start::date
                    UNION
                    SELECT date_trunc('day', fs.started_at) AS d
                    FROM public.focus_sessions fs WHERE fs.user_id = v_user_id AND fs.started_at >= v_period_start
                ) x
            )
        );
    END LOOP;

    -- Daily activity series (last 90 days) split by category, for the graph.
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_daily
    FROM (
        SELECT
            d::date AS date,
            COALESCE((SELECT COUNT(*) FROM public.exam_attempts a WHERE a.profile_id = v_user_id AND date_trunc('day', COALESCE(a.submitted_at, a.created_at)) = d), 0) AS exams,
            COALESCE((SELECT SUM(watched_seconds) FROM public.class_watch_sessions cws WHERE cws.profile_id = v_user_id AND cws.watch_date = d::date), 0) AS class_seconds,
            COALESCE((SELECT SUM(duration_seconds) FROM public.focus_sessions fs WHERE fs.user_id = v_user_id AND date_trunc('day', fs.started_at) = d), 0) AS focus_seconds
        FROM generate_series(date_trunc('day', now() - interval '90 days'), date_trunc('day', now()), interval '1 day') AS d
    ) t;

    RETURN jsonb_build_object('summaries', v_summaries, 'daily_activity', v_daily);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_performance_detail() TO authenticated;
