-- 20260723020000_guest_submit_exam_attempt.sql added a new 8-parameter
-- overload of submit_exam_attempt (with guest_* params), but the original
-- 4-parameter overload from 20260322000002_fix_exam_calculation.sql still
-- exists alongside it (CREATE OR REPLACE only replaces a matching
-- signature, it doesn't remove other overloads). PostgREST then can't
-- decide which overload a 4-arg call means, since defaults make the
-- 8-param version also callable with 4 args -> "Could not choose the best
-- candidate function" on every submit.
--
-- Fix: drop the old 4-parameter overload. All call sites now go through
-- the 8-parameter version (guest params optional/NULL for logged-in users).

DROP FUNCTION IF EXISTS public.submit_exam_attempt(uuid, jsonb, integer, integer);
