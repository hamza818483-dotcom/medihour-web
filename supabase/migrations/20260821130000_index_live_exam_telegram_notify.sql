-- The notify_live_exams_telegram() function runs every minute via cron and
-- scans public.exams with a filter on exam_type/is_published/
-- telegram_notify_enabled/telegram_notified_at/time_window_start. There was
-- no index covering this filter, so every run did a full table scan of
-- exams (1440 times/day), contributing meaningfully to Disk IO usage.
-- This partial index covers exactly the rows the cron job looks at
-- (pending live-exam notifications), keeping it small and cheap to maintain.

CREATE INDEX IF NOT EXISTS idx_exams_pending_telegram_notify
ON public.exams (time_window_start)
WHERE exam_type = 'live'
  AND is_published = true
  AND telegram_notify_enabled = true
  AND telegram_notified_at IS NULL;
