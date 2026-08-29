ALTER TABLE public.announcements
    ADD COLUMN IF NOT EXISTS send_notification boolean NOT NULL DEFAULT true;
