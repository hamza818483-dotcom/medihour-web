CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ch RECORD;
  bot_token text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT COALESCE(value #>> '{}', 'https://atlascourses.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end, telegram_channel_ids
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
      AND telegram_channel_ids IS NOT NULL
      AND array_length(telegram_channel_ids, 1) > 0
  LOOP
    exam_link := site_url || '/open-exam/' || r.id::text;
    duration_txt := COALESCE(r.duration_minutes::text, '0') || ' মিনিট';

    msg := '📌 <b>Exam Name:</b> ' || COALESCE(r.title, '') || E'\n\n'
      || '⚡ <b>Start:</b> ' || COALESCE(to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM'), '') || E'\n'
      || CASE WHEN r.time_window_end IS NOT NULL
              THEN '🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
              ELSE ''
         END
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || CASE WHEN r.telegram_message IS NOT NULL AND r.telegram_message <> ''
              THEN r.telegram_message || E'\n\n'
              ELSE ''
         END
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    FOR ch IN
      SELECT chat_id FROM public.telegram_channels
      WHERE id = ANY(r.telegram_channel_ids) AND is_active = true
    LOOP
      PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', ch.chat_id,
          'text', msg,
          'parse_mode', 'HTML'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    END LOOP;

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;
