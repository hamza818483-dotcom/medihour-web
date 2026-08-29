-- ExamReview.tsx fetches the attempt row directly via
-- `.from("exam_attempts").select("*, exam:exams(*)").eq("id", attemptId)`.
-- RLS policies apply per-row regardless of how a query filters, so there is
-- no way to allow "read this attempt only when you already know its id"
-- while still blocking a guest from listing/scanning all attempts — the
-- privacy-leak policy removed in 20260723050000 proved that. The only safe
-- way to expose a single row by id to anon is a SECURITY DEFINER RPC,
-- mirroring get_student_exam_review's ownership/guest-token model.

CREATE OR REPLACE FUNCTION public.get_exam_attempt_for_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_profile_id UUID;
    v_result JSONB;
BEGIN
    SELECT profile_id INTO v_profile_id
    FROM public.exam_attempts
    WHERE id = p_attempt_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Same ownership model as get_student_exam_review: a logged-in
    -- attempt must belong to the caller; a guest attempt (profile_id
    -- NULL) is accessible to anyone holding the attempt id.
    IF v_profile_id IS NOT NULL AND v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT to_jsonb(a) || jsonb_build_object('exam', to_jsonb(e))
    INTO v_result
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = p_attempt_id;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_attempt_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_for_review(uuid) TO anon;

NOTIFY pgrst, 'reload schema';
