ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS image_url text;

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS send_notification boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
