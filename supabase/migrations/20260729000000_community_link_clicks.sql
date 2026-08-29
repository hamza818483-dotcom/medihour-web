-- Tracks whether a student has clicked "Join Now" on their enrolled courses'
-- FB/Telegram community links, so we can nudge them (every ~5 min) to join
-- the ones they haven't clicked yet.

CREATE TABLE IF NOT EXISTS public.community_link_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (resource_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_community_link_clicks_profile ON public.community_link_clicks(profile_id);

ALTER TABLE public.community_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own link clicks"
    ON public.community_link_clicks
    FOR INSERT
    TO authenticated
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can read their own link clicks"
    ON public.community_link_clicks
    FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

-- Admins can see everyone's click status (for future reporting if needed).
CREATE POLICY "Admins can read all link clicks"
    ON public.community_link_clicks
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Record a click (upsert — idempotent, safe to call every time the button is pressed).
CREATE OR REPLACE FUNCTION public.record_community_link_click(p_resource_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.community_link_clicks (resource_id, profile_id, clicked_at)
    VALUES (p_resource_id, auth.uid(), now())
    ON CONFLICT (resource_id, profile_id)
    DO UPDATE SET clicked_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_community_link_click(UUID) TO authenticated;
