ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS extra_links jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.courses.extra_links IS 'Array of {label, url} — admin-added linked text shown under "এই কোর্স সম্পর্কে আরো" on the public course details page, unrelated to demo_content';
