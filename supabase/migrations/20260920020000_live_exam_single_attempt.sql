-- Live exams: allow only ONE live attempt per student (server-enforced), and
-- never delete/overwrite a live attempt. Practice re-attempts unchanged.
-- Also: leaderboard 'live' tab shows every live attempt (attempt_type='live').

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
    p_exam_id uuid,
    p_answers jsonb,
    p_violation_count integer DEFAULT 0,
    p_time_taken_seconds integer DEFAULT 0,
    p_guest_name text DEFAULT NULL,
    p_guest_hsc_batch text DEFAULT NULL,
    p_guest_college_name text DEFAULT NULL,
    p_guest_phone text DEFAULT NULL,
    p_is_second_timer boolean DEFAULT false
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_guest BOOLEAN := false;
    v_attempt_id UUID;
    v_total_score NUMERIC := 0;
    v_raw_score NUMERIC := 0;
    v_negative_mark NUMERIC;
    v_exam_total_marks NUMERIC;
    v_answer RECORD;
    v_correct_option TEXT;
    v_question_marks NUMERIC;
    v_deduction NUMERIC := 0;
    v_attempt_number INTEGER;
    v_exam_type TEXT;
    v_time_window_end TIMESTAMPTZ;
    v_attempt_type TEXT := 'practice';
    v_disable_second_timer_deduction BOOLEAN := false;
    v_is_visible_on_free BOOLEAN;
    v_allow_guest BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        IF p_guest_name IS NULL OR p_guest_phone IS NULL THEN
            RAISE EXCEPTION 'Not authenticated';
        END IF;
        v_is_guest := true;
    END IF;

    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end, COALESCE(disable_second_timer_deduction, false), COALESCE(is_visible_on_free, false), COALESCE(allow_guest, false)
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end, v_disable_second_timer_deduction, v_is_visible_on_free, v_allow_guest
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    IF v_is_guest AND NOT (v_is_visible_on_free OR v_allow_guest) THEN
        RAISE EXCEPTION 'Login required for this exam';
    END IF;

    IF v_exam_type = 'live' AND v_time_window_end IS NOT NULL AND now() <= v_time_window_end THEN
        v_attempt_type := 'live';
    ELSE
        v_attempt_type := 'practice';
    END IF;

    IF NOT v_is_guest AND v_attempt_type = 'live' THEN
        IF EXISTS (
            SELECT 1 FROM public.exam_attempts
            WHERE exam_id = p_exam_id AND profile_id = v_user_id AND attempt_type = 'live'
        ) THEN
            RAISE EXCEPTION 'You have already submitted this live exam';
        END IF;
    END IF;

    IF NOT v_is_guest THEN
        SELECT count(*) + 1 INTO v_attempt_number
        FROM public.study_activity_logs
        WHERE user_id = v_user_id
        AND activity_type = 'exam'
        AND (metadata->>'exam_id')::UUID = p_exam_id;

        DELETE FROM public.exam_attempts
        WHERE exam_id = p_exam_id
        AND profile_id = v_user_id
        AND attempt_type = v_attempt_type
        AND v_attempt_type <> 'live';
    END IF;

    FOR v_answer IN SELECT * FROM jsonb_to_recordset(p_answers) AS x(question_id UUID, selected_option TEXT)
    LOOP
        SELECT correct_option, COALESCE(marks, 1) INTO v_correct_option, v_question_marks
        FROM public.exam_questions
        WHERE id = v_answer.question_id;

        IF FOUND THEN
            IF v_answer.selected_option = v_correct_option THEN
                v_raw_score := v_raw_score + v_question_marks;
            ELSIF v_answer.selected_option IS NOT NULL AND v_answer.selected_option <> '' THEN
                v_raw_score := v_raw_score - v_negative_mark;
            END IF;
        END IF;
    END LOOP;

    IF p_is_second_timer AND NOT v_disable_second_timer_deduction THEN
        -- Flat 3% deduction of the exam's total marks
        v_deduction := v_exam_total_marks * 0.03;
    END IF;

    v_total_score := v_raw_score - v_deduction;

    INSERT INTO public.exam_attempts (
        exam_id, profile_id, score, total_marks, started_at, submitted_at,
        violation_count, answers, time_taken_seconds, attempt_number, attempt_type,
        guest_name, guest_hsc_batch, guest_college_name, guest_phone,
        is_second_timer_attempt
    )
    VALUES (
        p_exam_id, v_user_id, v_total_score, v_total_score, now(), now(),
        p_violation_count, p_answers, p_time_taken_seconds, v_attempt_number, v_attempt_type,
        CASE WHEN v_is_guest THEN p_guest_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_hsc_batch ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_college_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_phone ELSE NULL END,
        p_is_second_timer
    )
    RETURNING id INTO v_attempt_id;

    IF NOT v_is_guest THEN
        INSERT INTO public.study_activity_logs (user_id, activity_type, duration_seconds, metadata)
        VALUES (
            v_user_id, 'exam', p_time_taken_seconds,
            jsonb_build_object(
                'exam_id', p_exam_id, 'attempt_id', v_attempt_id, 'score', v_total_score,
                'raw_score', v_raw_score, 'deduction', v_deduction, 'attempt_number', v_attempt_number,
                'attempt_type', v_attempt_type, 'is_second_timer', p_is_second_timer
            )
        );
    END IF;

    RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text, boolean) TO authenticated;

-- Leaderboard view: run with owner rights so profile names always resolve
-- (RLS on profiles was hiding other students' names -> blank/Unknown rows).
DROP VIEW IF EXISTS public.leaderboard_exam_attempts;
CREATE VIEW public.leaderboard_exam_attempts WITH (security_invoker = false) AS
 SELECT a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object(
      'full_name', COALESCE(NULLIF(p.full_name, ''), a.guest_name),
      'registration_id', p.registration_id,
      'is_second_timer', COALESCE(p.is_second_timer, false),
      'hsc_batch', COALESCE(p.hsc_batch, a.guest_hsc_batch),
      'college_name', COALESCE(p.college_name, a.guest_college_name),
      'school', p.school,
      'avatar_url', p.avatar_url,
      'is_guest', (a.profile_id IS NULL)
    ) AS profile,
    a.attempt_number,
    a.time_taken_seconds,
    a.violation_count
   FROM (public.exam_attempts a
     LEFT JOIN public.profiles p ON ((p.id = a.profile_id)));
GRANT SELECT ON public.leaderboard_exam_attempts TO authenticated, anon;

-- Make 01570207871 an OWNER-level account (admin + teacher = full access).
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, r.role
FROM public.profiles p
CROSS JOIN (VALUES ('admin'::public.app_role), ('teacher'::public.app_role)) AS r(role)
WHERE p.phone IN ('01570207871', '+8801570207871', '8801570207871')
ON CONFLICT DO NOTHING;
