-- The "Guests can view attempts on free exams" policy from
-- 20260723010000_guest_exam_attempts.sql exposed EVERY guest's name and
-- phone number (via exam_attempts SELECT) to any anonymous visitor, not
-- just the guest's own attempt. The exam-review page never needed this —
-- it already reads via the SECURITY DEFINER get_student_exam_review RPC,
-- keyed by attempt id (the link itself is the access token). Drop the
-- broad policy; no feature depended on direct table-level guest SELECT.

DROP POLICY IF EXISTS "Guests can view attempts on free exams" ON public.exam_attempts;
