-- Add new columns to heroes table for advanced carousel items
ALTER TABLE public.heroes
ADD COLUMN IF NOT EXISTS hero_type TEXT DEFAULT 'image' CHECK (hero_type IN ('image', 'countdown', 'announcement')),
ADD COLUMN IF NOT EXISTS countdown_target TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS markdown_content TEXT,
ADD COLUMN IF NOT EXISTS background_config JSONB DEFAULT '{"type": "gradient", "from": "#064e3b", "to": "#022c22"}'::jsonb;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
