-- Exclude Custom Exams (Custom Exam Builder output, chapter = 'Custom') from
-- get_student_exam_analytics(). The "Routinewise Exam Report" tab must only
-- show scheduled/routine exams — Readymade was already excluded, Custom Exam
-- was not, so it was leaking into the routine report as well.

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
            AND (e.is_readymade IS NULL OR e.is_readymade = false) -- Exclude Readymade exams
            AND e.chapter IS DISTINCT FROM 'Custom' -- Exclude Custom Exam Builder output
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
