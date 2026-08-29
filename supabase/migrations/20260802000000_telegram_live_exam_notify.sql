-- Telegram notification on Live Exam start
-- 1) New columns on exams table
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS telegram_notify_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_message text,
  ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;

-- 2) Enable required extensions (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 3) App settings for bot token/channel (uses existing app_settings key/value pattern)
INSERT INTO public.app_settings (key, value)
VALUES
  ('telegram_bot_token', '"8812827959:AAGqowefvhmg-kAn5Gs6vc0IlMxMp23UGnU"'),
  ('telegram_channel_id', '"-1003634195330"')
ON CONFLICT (key) DO NOTHING;

-- 4) Function: check for exams that just went live and send Telegram message
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  bot_token text;
  channel_id text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT value #>> '{}' INTO channel_id FROM public.app_settings WHERE key = 'telegram_channel_id';
  SELECT COALESCE(value #>> '{}', 'https://beshijoss.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL OR channel_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
  LOOP
    exam_link := site_url || '/dashboard/take-exam/' || r.id;
    duration_txt := COALESCE(r.duration_minutes::text || ' মিনিট', 'N/A');

    msg := '📌 <b>Exam Name:</b> ' || r.title || E'\n\n'
      || '⚡ <b>Start:</b> ' || to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
      || COALESCE('🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n', '')
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || COALESCE(r.telegram_message || E'\n\n', '')
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    PERFORM extensions.net_http_post(
      url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', channel_id,
        'text', msg,
        'parse_mode', 'HTML'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;

-- 5) Schedule cron job every minute
SELECT cron.schedule(
  'notify-live-exams-telegram',
  '* * * * *',
  $$SELECT public.notify_live_exams_telegram();$$
);
