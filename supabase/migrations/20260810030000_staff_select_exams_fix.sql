-- Fix: teachers (staff, non-admin) could INSERT/UPDATE exams but had no SELECT
-- policy covering unpublished exams they just created. This caused
-- `.select("id").single()` after insert to return null (RLS filtered the row
-- out), which then made the exam_questions insert fail with:
--   "insert or update on table exam_questions violates foreign key
--    constraint exam_questions_exam_id_fkey"
-- because exam_id was undefined/null.

DROP POLICY IF EXISTS "Staff can view all exams" ON public.exams;

CREATE POLICY "Staff can view all exams" ON public.exams
    FOR SELECT USING (public.is_staff());

NOTIFY pgrst, 'reload schema';
