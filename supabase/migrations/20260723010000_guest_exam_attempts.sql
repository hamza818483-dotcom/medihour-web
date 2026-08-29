-- Guest / anonymous exam attempts for Free Exam.
-- A visitor who is NOT logged in can take a Free Exam by providing just:
--   name, HSC batch, college name, phone number
-- No auth.users account / signup is created. The attempt is stored with
-- profile_id = NULL and the 4 guest fields filled in instead.

-- 1. Allow profile_id to be NULL for guest attempts.
ALTER TABLE public.exam_attempts
  ALTER COLUMN profile_id DROP NOT NULL;

-- 2. Guest identity columns.
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_hsc_batch text,
  ADD COLUMN IF NOT EXISTS guest_college_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- 3. A guest attempt must always carry identity info; a logged-in attempt
--    must always carry a profile_id. Exactly one of the two paths.
ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_owner_check CHECK (
    (profile_id IS NOT NULL) OR
    (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
  );

-- 4. RLS: allow anonymous (anon) role to insert a guest attempt, but ONLY
--    for exams that are actually marked visible on the Free Exam page
--    (public.exams.is_visible_on_free = true). This prevents guests from
--    attempting paid/private exams by guessing an exam id.
CREATE POLICY "Guests can insert attempts on free exams"
  ON public.exam_attempts
  FOR INSERT
  TO anon
  WITH CHECK (
    profile_id IS NULL
    AND guest_name IS NOT NULL
    AND guest_phone IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_attempts.exam_id
        AND e.is_visible_on_free = true
    )
  );

-- 5. Guests also need to read the exam's questions to take it. Only for
--    exams visible on the Free Exam page.
CREATE POLICY "Guests can view questions of free exams"
  ON public.exam_questions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_questions.exam_id
        AND e.is_visible_on_free = true
    )
  );

-- 6. Guests need to read the exam row itself (title, duration, etc.) too.
CREATE POLICY "Guests can view free exams"
  ON public.exams
  FOR SELECT
  TO anon
  USING (is_visible_on_free = true);

-- 7. RLS: allow anonymous read of guest attempts on free exams only (needed
--    for the exam-review/result page right after a guest submits, and for
--    the Free Exam leaderboard). Guests are matched by phone number, which
--    the client keeps in sessionStorage for that browser session.
CREATE POLICY "Guests can view attempts on free exams"
  ON public.exam_attempts
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_attempts.exam_id
        AND e.is_visible_on_free = true
    )
  );
