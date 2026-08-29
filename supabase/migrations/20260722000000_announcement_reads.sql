-- Track which users have seen which announcements
CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(announcement_id, user_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own reads"
    ON public.announcement_reads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reads"
    ON public.announcement_reads FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reads"
    ON public.announcement_reads FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id
    ON public.announcement_reads(announcement_id);
