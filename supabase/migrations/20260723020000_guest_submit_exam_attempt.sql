-- Make the exam-taking pipeline guest-aware so a visitor can attempt a Free
-- Exam (public.exams.is_visible_on_free = true) without logging in, using
-- the SAME TakeExam.tsx flow/features as a logged-in student — the only
-- difference is how the attempt's owner is identified (profile_id vs guest_*
-- columns added in 20260723010000_guest_exam_attempts.sql).

-- 1. Let anonymous visitors call get_exam_questions_start (it already
--    special-cases is_visible_on_free = true and doesn't require p_user_id
--    for that path — it just needs anon EXECUTE permission).
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO anon;

-- 2. submit_exam_attempt: add optional guest identity params. When the
--    caller is authenticated (auth.uid() present), behavior is 100%
--    unchanged from before. When the caller is anonymous, guest info must
--    be supplied and the exam must be visible on the Free Exam page;
--    the attempt is stored with profile_id = NULL and the guest_* columns
--    filled in. Second-timer deduction and activity-log streak tracking
--    are skipped for guests (no profile to look up / no streak to track).
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
    p_exam_id uuid,
    p_answers jsonb,
    p_violation_count integer DEFAULT 0,
    p_time_taken_seconds integer DEFAULT 0,
    p_guest_name text DEFAULT NULL,
    p_guest_hsc_batch text DEFAULT NULL,
    p_guest_college_name text DEFAULT NULL,
    p_guest_phone text DEFAULT NULL
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
    v_is_second_timer BOOLEAN;
    v_answer RECORD;
    v_correct_option TEXT;
    v_question_marks NUMERIC;
    v_deduction NUMERIC := 0;
    v_attempt_number INTEGER;
    v_exam_type TEXT;
    v_time_window_end TIMESTAMPTZ;
    v_attempt_type TEXT := 'practice';
    v_question_count INTEGER := 0;
    v_disable_second_timer_deduction BOOLEAN := false;
    v_is_visible_on_free BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        -- No logged-in user — this can only proceed as a guest attempt on a
        -- Free Exam, with full guest identity supplied.
        IF p_guest_name IS NULL OR p_guest_phone IS NULL THEN
            RAISE EXCEPTION 'Not authenticated';
        END IF;
        v_is_guest := true;
    END IF;

    -- Get Exam Details (Moved up to determine attempt type before deletion)
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end, COALESCE(disable_second_timer_deduction, false), COALESCE(is_visible_on_free, false)
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end, v_disable_second_timer_deduction, v_is_visible_on_free
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    IF v_is_guest AND NOT v_is_visible_on_free THEN
        RAISE EXCEPTION 'Login required for this exam';
    END IF;

    -- Determine Attempt Type (Live vs Practice)
    IF v_exam_type = 'live' AND v_time_window_end IS NOT NULL AND now() <= v_time_window_end THEN
        v_attempt_type := 'live';
    ELSE
        v_attempt_type := 'practice';
    END IF;

    IF NOT v_is_guest THEN
        -- Calculate Attempt Number based on existing logs (logged-in only)
        SELECT count(*) + 1 INTO v_attempt_number
        FROM public.study_activity_logs
        WHERE user_id = v_user_id
        AND activity_type = 'exam'
        AND (metadata->>'exam_id')::UUID = p_exam_id;

        -- Delete previous attempts (Scoped to same attempt type)
        DELETE FROM public.exam_attempts
        WHERE exam_id = p_exam_id
        AND profile_id = v_user_id
        AND attempt_type = v_attempt_type;
    END IF;

    -- Calculate Score
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

    IF NOT v_is_guest THEN
        -- Second Timer Logic (logged-in only — guests have no profile)
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_user_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            SELECT count(*) INTO v_question_count
            FROM public.exam_questions
            WHERE exam_id = p_exam_id;

            IF v_question_count >= 100 THEN
                v_deduction := 3;
            ELSIF v_question_count >= 50 THEN
                v_deduction := 1.5;
            ELSIF v_question_count >= 30 THEN
                v_deduction := 1;
            END IF;
        END IF;
    END IF;

    v_total_score := v_raw_score - v_deduction;

    -- Create Attempt Record
    INSERT INTO public.exam_attempts (
        exam_id,
        profile_id,
        score,
        total_marks,
        started_at,
        submitted_at,
        violation_count,
        answers,
        time_taken_seconds,
        attempt_number,
        attempt_type,
        guest_name,
        guest_hsc_batch,
        guest_college_name,
        guest_phone
    )
    VALUES (
        p_exam_id,
        v_user_id, -- NULL for guests
        v_total_score,
        v_total_score,
        now(),
        now(),
        p_violation_count,
        p_answers,
        p_time_taken_seconds,
        v_attempt_number,
        v_attempt_type,
        CASE WHEN v_is_guest THEN p_guest_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_hsc_batch ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_college_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_phone ELSE NULL END
    )
    RETURNING id INTO v_attempt_id;

    IF NOT v_is_guest THEN
        -- Log Activity (logged-in only — streaks/stats are a profile concept)
        INSERT INTO public.study_activity_logs (
            user_id,
            activity_type,
            duration_seconds,
            metadata
        ) VALUES (
            v_user_id,
            'exam',
            p_time_taken_seconds,
            jsonb_build_object(
                'exam_id', p_exam_id,
                'attempt_id', v_attempt_id,
                'score', v_total_score,
                'raw_score', v_raw_score,
                'deduction', v_deduction,
                'attempt_number', v_attempt_number,
                'attempt_type', v_attempt_type,
                'is_second_timer', v_is_second_timer,
                'question_count', v_question_count
            )
        );
    END IF;

    RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
