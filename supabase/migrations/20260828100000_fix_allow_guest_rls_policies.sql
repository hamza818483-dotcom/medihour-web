-- The "Allow Without Login" (allow_guest) toggle on ExamForm only worked
-- client-side. submit_exam_attempt() already checks allow_guest (see
-- 20260812000000_second_timer_deduction_3percent.sql), but the RLS SELECT
-- policies for anon on exams/exam_questions and the INSERT/SELECT policies
-- on exam_attempts still only checked is_visible_on_free, so guests could
-- never actually SELECT the exam/questions or insert their attempt for an
-- exam that only has allow_guest=true (not on the Free Exam page). That
-- silently failed and effectively forced login. Update all guest policies
-- to also accept allow_guest = true.

DROP POLICY IF EXISTS "Guests can view free exams" ON public.exams;
CREATE POLICY "Guests can view free exams"
  ON public.exams
  FOR SELECT
  TO anon
  USING (is_visible_on_free = true OR allow_guest = true);

DROP POLICY IF EXISTS "Guests can view questions of free exams" ON public.exam_questions;
CREATE POLICY "Guests can view questions of free exams"
  ON public.exam_questions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_questions.exam_id
        AND (e.is_visible_on_free = true OR e.allow_guest = true)
    )
  );

DROP POLICY IF EXISTS "Guests can insert attempts on free exams" ON public.exam_attempts;
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
        AND (e.is_visible_on_free = true OR e.allow_guest = true)
    )
  );

DROP POLICY IF EXISTS "Guests can view attempts on free exams" ON public.exam_attempts;
CREATE POLICY "Guests can view attempts on free exams"
  ON public.exam_attempts
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_attempts.exam_id
        AND (e.is_visible_on_free = true OR e.allow_guest = true)
    )
  );

NOTIFY pgrst, 'reload schema';
