-- When an admin approves a student's payment/access request, the student
-- should be able to log in immediately without first clicking an email
-- confirmation link. This updates every path that can mark a request
-- 'approved' (the RPC called from the admin UI, the insert-trigger, and
-- the update-trigger) to also auto-confirm the user's email in auth.users,
-- bypassing the confirmation requirement once an admin has verified them.

CREATE OR REPLACE FUNCTION public.approve_payment_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_course_id UUID;
    v_profile_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: User is not an admin';
    END IF;

    SELECT course_id, profile_id INTO v_course_id, v_profile_id
    FROM public.payment_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment request not found';
    END IF;

    UPDATE public.payment_requests
    SET status = 'approved', updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.enrollments (profile_id, course_id)
    VALUES (v_profile_id, v_course_id)
    ON CONFLICT (profile_id, course_id) DO NOTHING;

    -- Admin approval bypasses email confirmation: the student's account
    -- ownership has effectively been verified by the admin, so an
    -- unconfirmed email should not block login afterward.
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_profile_id AND email_confirmed_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_approved_payment_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_course_name TEXT;
BEGIN
    IF NEW.status = 'approved' THEN
        INSERT INTO public.enrollments (profile_id, course_id)
        VALUES (NEW.profile_id, NEW.course_id)
        ON CONFLICT (profile_id, course_id) DO NOTHING;

        -- Same email-confirmation bypass as approve_payment_request(), for
        -- approvals that happen via a direct insert instead of that RPC.
        UPDATE auth.users
        SET email_confirmed_at = COALESCE(email_confirmed_at, now())
        WHERE id = NEW.profile_id AND email_confirmed_at IS NULL;

        SELECT name INTO v_course_name FROM public.courses WHERE id = NEW.course_id;

        INSERT INTO public.user_notifications (user_id, title, body, type)
        VALUES (
            NEW.profile_id,
            'Course Enrollment Approved! 🎉',
            'Congratulations! Your enrollment for ' || COALESCE(v_course_name, 'the course') || ' has been approved automatically.',
            'payment_approved'
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_payment_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
    v_course_name TEXT;
    v_data JSONB;
    v_status TEXT;
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;

    v_data := to_jsonb(NEW);

    IF v_data ? 'user_id' THEN
        v_user_id := (v_data ->> 'user_id')::UUID;
    ELSIF v_data ? 'profile_id' THEN
        v_user_id := (v_data ->> 'profile_id')::UUID;
    END IF;

    IF v_user_id IS NULL THEN
        v_user_id := NEW.profile_id;
    END IF;

    IF v_user_id IS NULL THEN RETURN NEW; END IF;

    SELECT name INTO v_course_name FROM courses WHERE id = NEW.course_id;
    v_status := LOWER(NEW.status);

    IF v_status = 'approved' THEN
        -- Same email-confirmation bypass, for approvals that happen via a
        -- direct UPDATE of payment_requests.status instead of the RPC.
        UPDATE auth.users
        SET email_confirmed_at = COALESCE(email_confirmed_at, now())
        WHERE id = v_user_id AND email_confirmed_at IS NULL;

        INSERT INTO user_notifications (user_id, title, body, type)
        VALUES (
            v_user_id,
            'Course Enrollment Approved! 🎉',
            'Congratulations! Your payment for ' || COALESCE(v_course_name, 'the course') || ' has been approved.',
            'payment_approved'
        );
    ELSIF v_status IN ('rejected', 'declined') THEN
        INSERT INTO user_notifications (user_id, title, body, type)
        VALUES (
            v_user_id,
            'Enrollment Request Declined ⚠️',
            'Your payment request for ' || COALESCE(v_course_name, 'the course') || ' was declined.',
            'payment_rejected'
        );
    END IF;

    RETURN NEW;
END;
$$;
