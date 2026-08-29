-- Tracks how many (distinct) students have viewed a class, for the "X জন দেখেছে"
-- stat shown on the class player page header.

CREATE TABLE IF NOT EXISTS public.class_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL,
    first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    view_count INTEGER DEFAULT 1 NOT NULL,
    UNIQUE (class_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_class_views_class_id ON public.class_views(class_id);

ALTER TABLE public.class_views ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can record/update their own view.
CREATE POLICY "Users can upsert their own class view"
    ON public.class_views
    FOR INSERT
    TO authenticated
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update their own class view"
    ON public.class_views
    FOR UPDATE
    TO authenticated
    USING (profile_id = auth.uid());

-- Everyone (including anon, for public course preview pages) can read aggregate counts.
CREATE POLICY "Anyone can read class views"
    ON public.class_views
    FOR SELECT
    USING (true);

-- Upsert helper: call this when a student opens a class player.
CREATE OR REPLACE FUNCTION public.record_class_view(p_class_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.class_views (class_id, profile_id, first_viewed_at, last_viewed_at, view_count)
    VALUES (p_class_id, auth.uid(), now(), now(), 1)
    ON CONFLICT (class_id, profile_id)
    DO UPDATE SET last_viewed_at = now(), view_count = public.class_views.view_count + 1;
END;
$$;
