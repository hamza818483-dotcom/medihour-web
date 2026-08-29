-- Make image_url nullable on heroes table to support non-image carousel items (like countdowns and announcements) without requiring dummy image URLs.
ALTER TABLE public.heroes ALTER COLUMN image_url DROP NOT NULL;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
