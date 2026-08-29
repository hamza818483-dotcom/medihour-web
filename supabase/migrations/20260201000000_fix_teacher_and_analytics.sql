-- Migration to fix teacher permissions and exam analytics
-- Created: 2026-02-01

-- 1. Fix Teacher Permissions (RLS)
-- Teachers need to be able to manage exam questions to "make exams".
-- Currently, policies only existed for Admins.

DROP POLICY IF EXISTS "Staff can insert exam questions" ON public.exam_questions;
CREATE POLICY "Staff can insert exam questions" ON public.exam_questions
FOR INSERT WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update exam questions" ON public.exam_questions;
CREATE POLICY "Staff can update exam questions" ON public.exam_questions
FOR UPDATE USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can delete exam questions" ON public.exam_questions;
CREATE POLICY "Staff can delete exam questions" ON public.exam_questions
FOR DELETE USING (public.is_staff());


-- Re-apply policies for classes (Safety check for "classes coming rls error")
DROP POLICY IF EXISTS "Staff can insert classes" ON public.classes;
CREATE POLICY "Staff can insert classes" ON public.classes
FOR INSERT WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update classes" ON public.classes;
CREATE POLICY "Staff can update classes" ON public.classes
FOR UPDATE USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can delete classes" ON public.classes;
CREATE POLICY "Staff can delete classes" ON public.classes
FOR DELETE USING (public.is_staff());


-- Re-apply policies for exams (Safety check)
DROP POLICY IF EXISTS "Staff can insert exams" ON public.exams;
CREATE POLICY "Staff can insert exams" ON public.exams
FOR INSERT WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update exams" ON public.exams;
CREATE POLICY "Staff can update exams" ON public.exams
FOR UPDATE USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can delete exams" ON public.exams;
CREATE POLICY "Staff can delete exams" ON public.exams
FOR DELETE USING (public.is_staff());


-- 2. Update Exam Analytics RPC
-- Fixes issue where exams shared with other courses were showing up under the original course name
-- instead of the course the student is enrolled in.

CREATE OR REPLACE FUNCTION public.get_student_exam_analytics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
    v_enrolled_courses uuid[];
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Fetch enrolled course IDs once
    SELECT array_agg(course_id) INTO v_enrolled_courses
    FROM public.enrollments
    WHERE profile_id = v_user_id;

    WITH relevant_exams AS (
        SELECT
            e.id,
            e.title,
            e.total_marks,
            e.time_window_start,
            e.time_window_end,
            e.created_at,
            e.course_id,
            e.is_archive,
            -- Determine the course name relevant to the user
            CASE
                -- 1. If enrolled in the primary course, use its name
                WHEN e.course_id = ANY(v_enrolled_courses) THEN c.name
                -- 2. If enrolled in a shared course, try to find its name
                WHEN e.shared_course_ids && v_enrolled_courses THEN (
                    SELECT name
                    FROM courses
                    WHERE id = ANY(e.shared_course_ids) AND id = ANY(v_enrolled_courses)
                    LIMIT 1
                )
                -- 3. Fallback to primary course name (or 'Public Exams' if null)
                ELSE c.name
            END as course_name
        FROM public.exams e
        LEFT JOIN public.courses c ON e.course_id = c.id
        WHERE
            e.is_published = true -- Must be published
            AND (
                -- 1. Enrolled Course Exams
                (e.course_id = ANY(v_enrolled_courses))
                OR
                -- 2. Public Active Exams (Not Archive)
                (e.course_id IS NULL AND (e.is_archive IS NULL OR e.is_archive = false))
                OR
                -- 3. Relevant Archived Exams (Shared with Enrolled Courses)
                (e.is_archive = true AND e.archive_course_ids && v_enrolled_courses)
                -- 4. Shared Course Exams (Active)
                OR (e.shared_course_ids && v_enrolled_courses)
            )
    ),
    my_attempts AS (
        SELECT
            exam_id,
            attempt_type,
            score,
            submitted_at
        FROM public.exam_attempts
        WHERE profile_id = v_user_id
    ),
    exam_stats AS (
        SELECT
            exam_id,
            attempt_type,
            MAX(score) as max_score
        FROM public.exam_attempts
        WHERE exam_id IN (SELECT id FROM relevant_exams)
        GROUP BY exam_id, attempt_type
    ),
    my_ranks AS (
         SELECT
            ma.exam_id,
            ma.attempt_type,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id
                  AND ea.attempt_type = ma.attempt_type
                  AND ea.score > ma.score
            ) as rank
         FROM my_attempts ma
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'total_marks', e.total_marks,
            'time_window_start', e.time_window_start,
            'time_window_end', e.time_window_end,
            'created_at', e.created_at,
            'course_name', COALESCE(e.course_name, 'Public Exams'),
            'is_archive', e.is_archive,

            -- Live Attempt Data
            'live_attempt', (
               SELECT jsonb_build_object(
                   'score', ma.score,
                   'rank', mr.rank,
                   'highest_score', es.max_score
               )
               FROM (SELECT 1) dummy
               LEFT JOIN my_attempts ma ON ma.exam_id = e.id AND ma.attempt_type = 'live'
               LEFT JOIN my_ranks mr ON mr.exam_id = e.id AND mr.attempt_type = 'live'
               LEFT JOIN exam_stats es ON es.exam_id = e.id AND es.attempt_type = 'live'
               WHERE ma.score IS NOT NULL
            ),

            -- Practice Attempt Data
            'practice_attempt', (
                 SELECT jsonb_build_object(
                    'score', ma.score,
                    'rank', mr.rank,
                    'highest_score', es.max_score
                )
                FROM (SELECT 1) dummy
                LEFT JOIN my_attempts ma ON ma.exam_id = e.id AND ma.attempt_type <> 'live'
                LEFT JOIN my_ranks mr ON mr.exam_id = e.id AND mr.attempt_type = ma.attempt_type
                LEFT JOIN exam_stats es ON es.exam_id = e.id AND es.attempt_type = ma.attempt_type
                WHERE ma.score IS NOT NULL
            ),

             -- Global High Scores
            'highest_live_score', (SELECT max_score FROM exam_stats WHERE exam_id = e.id AND attempt_type = 'live'),
            'highest_practice_score', (SELECT MAX(max_score) FROM exam_stats WHERE exam_id = e.id AND attempt_type <> 'live')
        ) ORDER BY COALESCE(e.time_window_start, e.created_at) DESC
    ) INTO v_result
    FROM relevant_exams e;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
