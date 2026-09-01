-- Replace old plain-text short_description with a structured animated checklist (JSONB array of lines)
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS short_description_lines jsonb DEFAULT '[]'::jsonb;

-- Replace old markdown full_description with structured blocks:
-- each block = { heading: text (bold, has animated icon), body: html (rich text: bold/italic/underline) }
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS full_description_blocks jsonb DEFAULT '[]'::jsonb;

-- Demo content item can now optionally have an admin-attached extra link (text + url) shown via "See" button
-- demo_content is already jsonb on courses table; no schema change needed for that array's shape,
-- it is validated/used at the application layer (adds optional note_link_label / note_link_url per item).

COMMENT ON COLUMN public.courses.short_description_lines IS 'Array of {text, bold} — animated checklist lines shown on course details page, replaces short_description';
COMMENT ON COLUMN public.courses.full_description_blocks IS 'Array of {heading, body} — heading is bold with animated icon, body supports bold/italic/underline rich text, replaces full_description markdown';
