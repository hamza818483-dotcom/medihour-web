-- Add show_on_landing to exams: controls whether an exam appears in the
-- landing page's "Live Now" section (Allow Dashboard toggle in admin's
-- ExamForm). This column was referenced by the app code but was missing
-- from migrations, causing "Could not find the 'show_on_landing' column"
-- errors when saving an exam.
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN DEFAULT false NOT NULL;

NOTIFY pgrst, 'reload schema';
