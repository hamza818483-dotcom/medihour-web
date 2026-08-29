-- Seed existing hardcoded Free Exam categories into global_metadata so admins
-- can rename/delete them and add new ones from the Exam form UI.
INSERT INTO public.global_metadata (type, value)
VALUES
  ('free_exam_category', 'HSC'),
  ('free_exam_category', 'Medical'),
  ('free_exam_category', 'Varsity'),
  ('free_exam_category', 'Onushilon')
ON CONFLICT (type, value) DO NOTHING;
