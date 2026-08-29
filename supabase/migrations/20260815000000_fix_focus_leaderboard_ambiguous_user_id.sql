-- Fix: converting focus_mood_leaderboard to plpgsql (stale-session sweep migration)
-- introduced a RETURNS TABLE(user_id uuid, ...) OUT parameter that collides with the
-- bare `user_id` column references inside the CTEs, causing:
--   ERROR: 42702: column reference "user_id" is ambiguous
-- Fix: qualify every user_id reference inside the CTEs with its source alias.

DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);

CREATE OR REPLACE FUNCTION public.focus_mood_leaderboard(p_mood text, p_days int)
RETURNS TABLE(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  WITH ended AS (
    SELECT fs.user_id AS uid, fs.mood, sum(fs.duration_seconds)::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'ended'
      AND fs.created_at >= now() - (p_days || ' days')::interval
    GROUP BY fs.user_id, fs.mood
  ),
  live AS (
    SELECT fs.user_id AS uid, fs.mood, fs.duration_seconds::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'active'
  ),
  combined AS (
    SELECT uid, mood, secs FROM ended
    UNION ALL
    SELECT uid, mood, secs FROM live
  ),
  per_user_mood AS (
    SELECT uid, mood, sum(secs)::bigint AS secs
    FROM combined
    GROUP BY uid, mood
  ),
  per_user AS (
    SELECT
      uid,
      COALESCE(sum(secs) FILTER (WHERE mood = 'study'), 0)::bigint AS study_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'break'), 0)::bigint AS break_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'sleep'), 0)::bigint AS sleep_seconds
    FROM per_user_mood
    GROUP BY uid
  ),
  scored AS (
    SELECT
      uid,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) AS score
    FROM per_user
    WHERE study_seconds > 0 OR break_seconds > 0 OR sleep_seconds > 0
  )
  SELECT
    s.uid,
    p.full_name,
    p.hsc_batch,
    CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END AS total_seconds
  FROM scored s
  JOIN public.profiles p ON p.id = s.uid
  WHERE CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END > 0
  ORDER BY s.score DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_mood_leaderboard(text, int) TO authenticated, anon;
