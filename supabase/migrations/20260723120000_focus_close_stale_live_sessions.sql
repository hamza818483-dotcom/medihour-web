-- Fix: a focus session could stay status='active' forever if the browser
-- was closed, crashed, or lost connection before focus_end_session ran —
-- showing that student as "Live" with a frozen/zero duration indefinitely.
--
-- Fix: track the last heartbeat time (heartbeat already fires every 5s from
-- the client via focus_update_session), and treat any 'active' session with
-- no heartbeat in the last 60 seconds as stale — auto-close it wherever
-- live/leaderboard data is read. This does NOT change which mood list a
-- student's completed time counts toward; it only stops a dead session from
-- showing as currently "Live".

ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Backfill: treat existing active rows as if they just heartbeated, so this
-- migration doesn't instantly mass-close genuinely live sessions.
UPDATE public.focus_sessions
  SET last_heartbeat_at = now()
  WHERE status = 'active' AND last_heartbeat_at IS NULL;

-- 1. Heartbeat now stamps last_heartbeat_at.
CREATE OR REPLACE FUNCTION public.focus_update_session(p_id bigint, p_duration_seconds int, p_is_paused boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.focus_sessions
    SET duration_seconds = p_duration_seconds, is_paused = p_is_paused, last_heartbeat_at = now()
    WHERE id = p_id AND user_id = auth.uid() AND status = 'active';
$$;

-- 2. Small helper: auto-close any 'active' session that hasn't heartbeated
--    in over 60 seconds (dead tab/browser closed/crash). Safe to call often;
--    called at the top of focus_live_now() and focus_start_session() so
--    stale sessions never linger and never block a fresh session start.
CREATE OR REPLACE FUNCTION public.focus_close_stale_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.focus_sessions
    SET status = 'ended', ended_at = now(), is_paused = false
    WHERE status = 'active'
      AND COALESCE(last_heartbeat_at, started_at) < now() - interval '60 seconds';
$$;

GRANT EXECUTE ON FUNCTION public.focus_close_stale_sessions() TO authenticated, anon;

-- 3. focus_live_now: close stale sessions first, then read — so a dead
--    session never shows up as "Live" with a frozen/zero time.
DROP FUNCTION IF EXISTS public.focus_live_now();

CREATE OR REPLACE FUNCTION public.focus_live_now()
RETURNS TABLE(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  SELECT fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at, p.avatar_url
  FROM public.focus_sessions fs
  JOIN public.profiles p ON p.id = fs.user_id
  WHERE fs.status = 'active'
  ORDER BY fs.duration_seconds DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_live_now() TO authenticated, anon;

-- 5. focus_mood_leaderboard also UNIONs live 'active' sessions into the
--    ranking (see 20260722020000_focus_leaderboard_score_ranking.sql) — a
--    stale session there would similarly inflate/freeze a student's ranked
--    time. Wrap it to sweep stale sessions first, keeping the exact same
--    ranking logic/signature as before.
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
    SELECT fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'ended'
      AND fs.created_at >= now() - (p_days || ' days')::interval
    GROUP BY fs.user_id, fs.mood
  ),
  live AS (
    SELECT fs.user_id, fs.mood, fs.duration_seconds::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'active'
  ),
  combined AS (
    SELECT user_id, mood, secs FROM ended
    UNION ALL
    SELECT user_id, mood, secs FROM live
  ),
  per_user_mood AS (
    SELECT user_id, mood, sum(secs)::bigint AS secs
    FROM combined
    GROUP BY user_id, mood
  ),
  per_user AS (
    SELECT
      user_id,
      COALESCE(sum(secs) FILTER (WHERE mood = 'study'), 0)::bigint AS study_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'break'), 0)::bigint AS break_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'sleep'), 0)::bigint AS sleep_seconds
    FROM per_user_mood
    GROUP BY user_id
  ),
  scored AS (
    SELECT
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) AS score
    FROM per_user
    WHERE study_seconds > 0 OR break_seconds > 0 OR sleep_seconds > 0
  )
  SELECT
    s.user_id,
    p.full_name,
    p.hsc_batch,
    CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END AS total_seconds
  FROM scored s
  JOIN public.profiles p ON p.id = s.user_id
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
