-- Update heroes table to use dark emerald as the default for new rows
ALTER TABLE public.heroes 
ALTER COLUMN background_config SET DEFAULT '{"type": "gradient", "from": "#064e3b", "to": "#022c22"}'::jsonb;

-- Update existing rows to the new dark emerald color
UPDATE public.heroes 
SET background_config = '{"type": "gradient", "from": "#064e3b", "to": "#022c22"}'::jsonb
WHERE background_config = '{"type": "gradient", "from": "#10b981", "to": "#059669"}'::jsonb 
   OR background_config IS NULL;
