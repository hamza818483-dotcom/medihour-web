
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'moderator',
    'user',
    'teacher'
);


--
-- Name: app_role_new; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role_new AS ENUM (
    'admin',
    'teacher',
    'moderator',
    'user'
);


--
-- Name: approve_payment_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_payment_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_course_id UUID;
    v_profile_id UUID;
BEGIN
    -- Check if user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: User is not an admin';
    END IF;

    -- Get request details explicitly into variables
    SELECT course_id, profile_id INTO v_course_id, v_profile_id
    FROM public.payment_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment request not found';
    END IF;

    -- Update payment request status
    UPDATE public.payment_requests
    SET status = 'approved', updated_at = now()
    WHERE id = p_request_id;

    -- Insert enrollment (ignore if already exists)
    INSERT INTO public.enrollments (profile_id, course_id)
    VALUES (v_profile_id, v_course_id)
    ON CONFLICT (profile_id, course_id) DO NOTHING;

END;
$$;


--
-- Name: check_promo_code(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_promo_code(p_code text, p_course_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_promo record;
BEGIN
    SELECT * INTO v_promo FROM public.promo_codes 
    WHERE code = p_code AND is_active = true AND (course_id IS NULL OR course_id = p_course_id);

    IF v_promo IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Invalid promo code');
    END IF;

    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Promo code usage limit exceeded');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'discount_amount', v_promo.discount_amount,
        'discount_type', v_promo.discount_type,
        'id', v_promo.id
    );
END;
$$;


--
-- Name: enroll_in_free_course(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enroll_in_free_course(p_course_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_price numeric;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Check course price
  SELECT price INTO v_price FROM courses WHERE id = p_course_id;
  
  IF v_price > 0 THEN
    RAISE EXCEPTION 'This course is not free.';
  END IF;

  -- Insert enrollment if not exists
  INSERT INTO enrollments (profile_id, course_id)
  VALUES (v_user_id, p_course_id)
  ON CONFLICT DO NOTHING;
END;
$$;


--
-- Name: get_admin_profiles_paginated(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_profiles_paginated(p_filter_type text, p_search text, p_page integer, p_page_size integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_offset integer;
    v_total_count integer;
    v_data json;
BEGIN
    v_offset := p_page * p_page_size;

    -- CTE for filtering IDs
    CREATE TEMP TABLE temp_filtered_ids AS
    SELECT p.id
    FROM profiles p
    LEFT JOIN (SELECT profile_id, count(*) as c FROM enrollments GROUP BY profile_id) ea ON p.id = ea.profile_id
    LEFT JOIN (SELECT user_id, array_agg(role::text) as roles FROM user_roles GROUP BY user_id) ura ON p.id = ura.user_id
    WHERE 
        (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%' || p_search || '%' OR p.registration_id ILIKE '%' || p_search || '%')
        AND (
            p_filter_type = 'all' OR
            (p_filter_type = 'paid' AND ea.c > 0) OR
            (p_filter_type = 'unpaid' AND (ea.c IS NULL OR ea.c = 0)) OR
            (p_filter_type = 'admin' AND 'admin' = ANY(ura.roles)) OR
            (p_filter_type = 'teacher' AND 'teacher' = ANY(ura.roles))
        );

    SELECT count(*) INTO v_total_count FROM temp_filtered_ids;

    SELECT json_agg(t) INTO v_data
    FROM (
        SELECT 
            p.*,
            (
                SELECT json_agg(json_build_object('id', e.id, 'course_id', e.course_id, 'courses', json_build_object('name', c.name)))
                FROM enrollments e
                JOIN courses c ON e.course_id = c.id
                WHERE e.profile_id = p.id
            ) as enrollments,
            (
                SELECT json_agg(ur.role)
                FROM user_roles ur
                WHERE ur.user_id = p.id
            ) as roles
        FROM profiles p
        WHERE p.id IN (SELECT id FROM temp_filtered_ids ORDER BY id LIMIT p_page_size OFFSET v_offset)
        ORDER BY p.created_at DESC
    ) t;

    DROP TABLE temp_filtered_ids;

    RETURN json_build_object('data', COALESCE(v_data, '[]'::json), 'count', v_total_count);
END;
$$;


--
-- Name: get_admin_student_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_student_stats() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  paid_count integer;
  unpaid_count integer;
  admin_count integer;
  teacher_count integer;
BEGIN
  -- Paid: Count distinct profiles in enrollments
  SELECT COUNT(DISTINCT profile_id) INTO paid_count FROM enrollments;

  -- Unpaid: Total profiles - Paid
  SELECT COUNT(*) - paid_count INTO unpaid_count FROM profiles;

  -- Admin: Count user_roles where role = 'admin'
  SELECT COUNT(DISTINCT user_id) INTO admin_count 
  FROM user_roles 
  WHERE role = 'admin';

  -- Teacher: Count user_roles where role = 'teacher'
  SELECT COUNT(DISTINCT user_id) INTO teacher_count 
  FROM user_roles 
  WHERE role::text = 'teacher';

  RETURN json_build_object(
    'paid', paid_count,
    'unpaid', unpaid_count,
    'admins', admin_count,
    'teachers', teacher_count
  );
END;
$$;


--
-- Name: get_app_setting(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_app_setting(p_key text) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT value FROM public.app_settings WHERE key = p_key;
$$;


--
-- Name: get_dashboard_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_data() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
    v_enrolled_course_ids UUID[];
    v_next_class JSON;
    v_active_live_classes JSON;
    v_active_live_exams JSON;
    v_next_exam JSON;
BEGIN
    v_user_id := auth.uid();

    -- Get enrolled course IDs (including linked courses if implemented, but for now direct enrollments)
    -- If you have linked courses logic in SQL, use it. Otherwise, strictly enrollments.
    SELECT ARRAY_AGG(course_id) INTO v_enrolled_course_ids
    FROM enrollments
    WHERE profile_id = v_user_id;

    -- 1. Next Class (First upcoming live class)
    SELECT json_build_object(
        'id', c.id,
        'title', c.title,
        'start_at', c.start_at,
        'video_url', c.video_url,
        'course', json_build_object('name', co.name)
    ) INTO v_next_class
    FROM classes c
    JOIN courses co ON c.course_id = co.id
    WHERE (c.course_id = ANY(v_enrolled_course_ids) OR c.shared_course_ids && v_enrolled_course_ids)
      AND c.class_type = 'live'
      AND c.start_at > NOW()
    ORDER BY c.start_at ASC
    LIMIT 1;

    -- 2. Active Live Classes (Happening NOW)
    SELECT json_agg(
        json_build_object(
            'id', c.id,
            'title', c.title,
            'start_at', c.start_at,
            'video_url', c.video_url,
            'course', json_build_object('name', co.name)
        ) ORDER BY c.start_at ASC
    ) INTO v_active_live_classes
    FROM classes c
    JOIN courses co ON c.course_id = co.id
    WHERE (c.course_id = ANY(v_enrolled_course_ids) OR c.shared_course_ids && v_enrolled_course_ids)
      AND c.class_type = 'live'
      AND c.start_at <= NOW()
      AND c.end_at >= NOW();

    -- 3. Active Live Exams (Happening NOW)
    SELECT json_agg(
        json_build_object(
            'id', e.id,
            'title', e.title,
            'time_window_end', e.time_window_end,
            'course', json_build_object('name', co.name)
        )
    ) INTO v_active_live_exams
    FROM exams e
    JOIN courses co ON e.course_id = co.id
    WHERE (e.course_id = ANY(v_enrolled_course_ids) OR e.shared_course_ids && v_enrolled_course_ids)
      AND e.exam_type = 'live'
      AND e.is_published = true
      AND e.time_window_start <= NOW()
      AND e.time_window_end >= NOW();

    -- 4. Next Exam
    SELECT json_build_object(
        'id', e.id,
        'title', e.title,
        'time_window_start', e.time_window_start,
        'course', json_build_object('name', co.name)
    ) INTO v_next_exam
    FROM exams e
    JOIN courses co ON e.course_id = co.id
    WHERE (e.course_id = ANY(v_enrolled_course_ids) OR e.shared_course_ids && v_enrolled_course_ids)
      AND e.exam_type = 'live'
      AND e.is_published = true
      AND e.time_window_start > NOW()
    ORDER BY e.time_window_start ASC
    LIMIT 1;

    RETURN json_build_object(
        'next_class', v_next_class,
        'active_live_classes', COALESCE(v_active_live_classes, '[]'::json),
        'active_live_exams', COALESCE(v_active_live_exams, '[]'::json),
        'next_exam', v_next_exam
    );
END;
$$;


--
-- Name: get_exam_questions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_exam_questions(p_exam_id uuid) RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, marks numeric, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.marks,
        q.question_index
    FROM exam_questions q
    WHERE q.exam_id = p_exam_id
    ORDER BY q.question_index;
END;
$$;


--
-- Name: get_exam_questions_start(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_shared_course_ids uuid[];
  v_has_access boolean := false;
BEGIN
  -- 1. Get Exam Metadata
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  -- 2. Check Access Logic
  IF v_exam_course_id IS NULL THEN
      -- Case: Public Exam
      IF v_is_visible_on_free IS TRUE THEN
          v_has_access := true;
      END IF;
  ELSE
      -- Case: Course Exam
      
      -- Check A: Direct Enrollment
      IF NOT v_has_access THEN
          SELECT EXISTS (
              SELECT 1 FROM public.enrollments en
              WHERE en.profile_id = p_user_id 
              AND en.course_id = v_exam_course_id
          ) INTO v_has_access;
      END IF;

      -- Check B: Linked Course (Extra Course)
      IF NOT v_has_access THEN
          SELECT EXISTS (
              SELECT 1
              FROM public.enrollments e
              JOIN public.courses c ON e.course_id = c.id
              WHERE e.profile_id = p_user_id
              AND c.linked_course_ids IS NOT NULL
              -- Compare UUID (v_exam_course_id) against Text Array (linked_course_ids) safely
              AND v_exam_course_id::text = ANY(COALESCE(c.linked_course_ids, '{}')::text[])
          ) INTO v_has_access;
      END IF;

      -- Check C: Shared Course
      IF NOT v_has_access AND v_shared_course_ids IS NOT NULL THEN
          SELECT EXISTS (
              SELECT 1 FROM public.enrollments en_shared
              WHERE en_shared.profile_id = p_user_id
              AND en_shared.course_id = ANY(v_shared_course_ids)
          ) INTO v_has_access;
      END IF;
  END IF;

  -- 3. Return Questions if Access Granted
  IF v_has_access THEN
      RETURN QUERY
      SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.question_index
      FROM public.exam_questions q
      WHERE q.exam_id = p_exam_id
      ORDER BY q.question_index ASC;
  ELSE
      -- Return Empty (Access Denied)
      RETURN;
  END IF;
END;
$$;


--
-- Name: get_pending_payment_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pending_payment_count() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check if user is admin (optional but good practice)
    -- For now, we'll return the count. The frontend only calls this if isAdmin is true.
    -- To be safe, we can add a basic role check if the has_role function exists,
    -- but relying on RLS or simple logic is safer for this specific helper.

    SELECT count(*)::INTEGER INTO v_count
    FROM public.payment_requests
    WHERE status = 'pending';

    RETURN v_count;
END;
$$;


--
-- Name: get_student_exam_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_student_exam_analytics() RETURNS jsonb
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
            c.name as course_name
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


--
-- Name: get_student_exam_analytics_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_student_exam_analytics_v2() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id uuid;
    v_exams json;
BEGIN
    v_user_id := auth.uid();
    
    -- Get exams that are either:
    -- 1. Enrolled course exams
    -- 2. Shared course exams
    -- 3. Public exams (is_visible_on_free = true)
    -- AND NOT Archive Only (unless enrolled?)
    -- Actually, if an exam is Archive Only (course_id=null, is_visible_on_free=false), it should NOT show here unless specifically fetched from archive (which this RPC is not for).
    -- This RPC is for "Exam Analytics" page.
    -- We want to exclude exams that are "Archive Only" (hidden from public).
    
    SELECT json_agg(t) INTO v_exams
    FROM (
        SELECT 
            e.id,
            e.title,
            e.total_marks,
            e.time_window_start,
            e.time_window_end,
            e.created_at,
            c.name as course_name,
            -- Live Attempt
            (
                SELECT json_build_object(
                    'score', la.score,
                    'rank', (
                        SELECT COUNT(*) + 1 
                        FROM exam_attempts 
                        WHERE exam_id = e.id 
                        AND attempt_type = 'live' 
                        AND score > la.score
                    ),
                    'highest_score', (
                        SELECT MAX(score) 
                        FROM exam_attempts 
                        WHERE exam_id = e.id 
                        AND attempt_type = 'live'
                    )
                )
                FROM exam_attempts la
                WHERE la.exam_id = e.id 
                AND la.profile_id = v_user_id 
                AND la.attempt_type = 'live'
                LIMIT 1
            ) as live_attempt,
            -- Practice Attempt
            (
                SELECT json_build_object(
                    'score', pa.score,
                    'rank', (
                        SELECT COUNT(*) + 1 
                        FROM exam_attempts 
                        WHERE exam_id = e.id 
                        AND attempt_type = 'practice' 
                        AND score > pa.score
                    ),
                    'highest_score', (
                        SELECT MAX(score) 
                        FROM exam_attempts 
                        WHERE exam_id = e.id 
                        AND attempt_type = 'practice'
                    )
                )
                FROM exam_attempts pa
                WHERE pa.exam_id = e.id 
                AND pa.profile_id = v_user_id 
                AND pa.attempt_type = 'practice'
                ORDER BY pa.score DESC
                LIMIT 1
            ) as practice_attempt,
            -- Highest Scores Global
            (SELECT MAX(score) FROM exam_attempts WHERE exam_id = e.id AND attempt_type = 'live') as highest_live_score,
            (SELECT MAX(score) FROM exam_attempts WHERE exam_id = e.id AND attempt_type = 'practice') as highest_practice_score
        FROM exams e
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE 
            e.is_published = true
            AND (
                -- 1. Course Enrolled
                e.course_id IN (SELECT course_id FROM enrollments WHERE profile_id = v_user_id)
                -- 2. Shared Course Enrolled
                OR EXISTS (
                    SELECT 1 FROM enrollments en 
                    WHERE en.profile_id = v_user_id 
                    AND en.course_id = ANY(e.shared_course_ids)
                )
                -- 3. Public (Free) AND Visible
                OR (e.course_id IS NULL AND e.is_visible_on_free = true)
                -- 4. User has actually attempted it (even if hidden/archived now)
                OR EXISTS (
                    SELECT 1 FROM exam_attempts att 
                    WHERE att.exam_id = e.id 
                    AND att.profile_id = v_user_id
                )
            )
        ORDER BY e.created_at DESC
    ) t;

    RETURN COALESCE(v_exams, '[]'::json);
END;
$$;


--
-- Name: get_student_exam_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_student_exam_review(p_attempt_id uuid) RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
BEGIN
    -- Get exam_id and profile_id from attempt
    SELECT exam_id, profile_id INTO v_exam_id, v_profile_id
    FROM exam_attempts
    WHERE id = p_attempt_id;

    -- Check if the user is the owner of the attempt
    IF v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT
        q.id as question_id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option::TEXT,
        q.marks,
        q.explanation,
        q.question_index
    FROM exam_questions q
    WHERE q.exam_id = v_exam_id
    ORDER BY q.question_index;
END;
$$;


--
-- Name: get_total_revenue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_total_revenue() RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    total numeric;
BEGIN
    SELECT COALESCE(SUM(c.price), 0)
    INTO total
    FROM payment_requests pr
    JOIN courses c ON pr.course_id = c.id
    WHERE pr.status = 'approved';
    
    RETURN total;
END;
$$;


--
-- Name: handle_approved_payment_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_approved_payment_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_course_name TEXT;
BEGIN
    IF NEW.status = 'approved' THEN
        -- 1. Create Enrollment
        INSERT INTO public.enrollments (profile_id, course_id)
        VALUES (NEW.profile_id, NEW.course_id)
        ON CONFLICT (profile_id, course_id) DO NOTHING;

        -- 2. Send Notification
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


--
-- Name: handle_payment_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_payment_status_change() RETURNS trigger
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

    -- Robust check for user_id or profile_id
    IF v_data ? 'user_id' THEN
        v_user_id := (v_data ->> 'user_id')::UUID;
    ELSIF v_data ? 'profile_id' THEN
        v_user_id := (v_data ->> 'profile_id')::UUID;
    END IF;

    IF v_user_id IS NULL THEN 
        -- Fallback: try to select from table if JSONB conversion failed (rare)
        v_user_id := NEW.profile_id;
    END IF;
    
    IF v_user_id IS NULL THEN RETURN NEW; END IF;

    SELECT name INTO v_course_name FROM courses WHERE id = NEW.course_id;
    v_status := LOWER(NEW.status);

    IF v_status = 'approved' THEN
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


--
-- Name: handle_promo_payment_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_promo_payment_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if it's a promo-free request
    IF NEW.trx_id = 'PROMO-FREE-PAID' THEN
        NEW.status := 'approved';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'teacher')
  );
$$;


--
-- Name: is_teacher(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_teacher() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'teacher'
  );
$$;


--
-- Name: reject_payment_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_payment_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: User is not an admin';
    END IF;

    -- Update payment request status
    UPDATE public.payment_requests
    SET status = 'rejected', updated_at = now()
    WHERE id = p_request_id;
END;
$$;


--
-- Name: submit_exam_attempt(uuid, jsonb, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb, p_violation_count integer DEFAULT 0, p_time_taken_seconds integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
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
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Calculate Attempt Number based on existing logs
    SELECT count(*) + 1 INTO v_attempt_number
    FROM public.study_activity_logs
    WHERE user_id = v_user_id
    AND activity_type = 'exam'
    AND (metadata->>'exam_id')::UUID = p_exam_id;

    -- Get Exam Details (Moved up to determine attempt type before deletion)
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    -- Determine Attempt Type (Live vs Practice)
    IF v_exam_type = 'live' AND v_time_window_end IS NOT NULL AND now() <= v_time_window_end THEN
        v_attempt_type := 'live';
    ELSE
        v_attempt_type := 'practice';
    END IF;

    -- Delete previous attempts (Scoped to same attempt type)
    DELETE FROM public.exam_attempts
    WHERE exam_id = p_exam_id
    AND profile_id = v_user_id
    AND attempt_type = v_attempt_type;

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

    -- Second Timer Logic
    SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_is_second_timer THEN
        -- Calculate question count for the exam
        SELECT count(*) INTO v_question_count
        FROM public.exam_questions
        WHERE exam_id = p_exam_id;

        -- Use question count for deduction logic
        IF v_question_count >= 100 THEN
            v_deduction := 3;
        ELSIF v_question_count >= 50 THEN
            v_deduction := 1.5;
        ELSIF v_question_count >= 30 THEN
            v_deduction := 1;
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
        attempt_type
    )
    VALUES (
        p_exam_id,
        v_user_id,
        v_total_score,
        v_total_score,
        now(),
        now(),
        p_violation_count,
        p_answers,
        p_time_taken_seconds,
        v_attempt_number,
        v_attempt_type
    )
    RETURNING id INTO v_attempt_id;

    -- Log Activity
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

    RETURN v_attempt_id;
END;
$$;


--
-- Name: sync_retroactive_enrollments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_retroactive_enrollments() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_enrollment record;
  v_course record;
  v_included_id uuid;
  v_current_metadata jsonb;
  v_new_allowed_sections text[];
BEGIN
  -- Iterate through ALL enrollments
  FOR v_enrollment IN SELECT * FROM enrollments LOOP
    
    -- Get Course Details
    SELECT * INTO v_course FROM courses WHERE id = v_enrollment.course_id;
    
    IF v_course IS NOT NULL THEN
        -- 1. Sync Included Courses (Bundles)
        IF v_course.included_course_ids IS NOT NULL THEN
            FOREACH v_included_id IN ARRAY v_course.included_course_ids
            LOOP
                -- Check if already enrolled, if not insert
                INSERT INTO enrollments (profile_id, course_id, metadata)
                VALUES (v_enrollment.profile_id, v_included_id, '{}'::jsonb)
                ON CONFLICT (profile_id, course_id) DO NOTHING;
            END LOOP;
        END IF;

        -- 2. Sync Sections (Metadata)
        v_current_metadata := v_enrollment.metadata;
        IF v_current_metadata IS NULL THEN
            v_current_metadata := '{}'::jsonb;
        END IF;

        -- If course has sections, ensure they are in metadata
        IF v_course.sections IS NOT NULL AND array_length(v_course.sections, 1) > 0 THEN
             -- Merge or Set logic? Let's just set for now to match the course.
             -- If user had custom sections, this might overwrite.
             -- But since this feature is new, overwriting is likely desired to sync with course definition.
             
             UPDATE enrollments
             SET metadata = jsonb_set(v_current_metadata, '{allowed_sections}', to_jsonb(v_course.sections))
             WHERE id = v_enrollment.id;
        END IF;
    END IF;

  END LOOP;
END;
$$;


--
-- Name: toggle_anti_cheat(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_anti_cheat(p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Enforce admin authorization
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  INSERT INTO public.app_settings (key, value)
  VALUES ('anti_cheat_enabled', to_jsonb(p_enabled))
  ON CONFLICT (key) DO UPDATE
    SET value = to_jsonb(p_enabled),
        updated_at = now();
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: verify_and_reset_password(text, text, text, text, text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_and_reset_password(p_identifier text, p_method text, p_father_name text, p_mother_name text, p_hsc_batch text, p_college_name text DEFAULT NULL::text, p_ssc_gpa numeric DEFAULT NULL::numeric, p_new_password text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
    target_user_id uuid;
    found_ssc_gpa numeric;
BEGIN
    -- 1. Determine Target User ID based on method
    IF p_method = 'phone' THEN
        SELECT id INTO target_user_id
        FROM public.profiles
        WHERE phone = p_identifier
          AND LOWER(TRIM(father_name)) = LOWER(TRIM(p_father_name))
          AND LOWER(TRIM(mother_name)) = LOWER(TRIM(p_mother_name))
          AND LOWER(TRIM(hsc_batch::text)) = LOWER(TRIM(p_hsc_batch));
    
    ELSIF p_method = 'email' THEN
        -- First find the user ID from auth.users by email
        -- We join with profiles to verify the details
        SELECT u.id, p.ssc_gpa INTO target_user_id, found_ssc_gpa
        FROM auth.users u
        JOIN public.profiles p ON u.id = p.id
        WHERE u.email = p_identifier
          AND LOWER(TRIM(p.father_name)) = LOWER(TRIM(p_father_name))
          AND LOWER(TRIM(p.mother_name)) = LOWER(TRIM(p_mother_name))
          AND LOWER(TRIM(p.hsc_batch::text)) = LOWER(TRIM(p_hsc_batch))
          -- Extra protection for Email users
          AND LOWER(TRIM(p.college_name)) = LOWER(TRIM(p_college_name));
        
        -- Check SSC GPA if user was found (floating point safe comparison)
        IF target_user_id IS NOT NULL THEN
             IF p_ssc_gpa IS NULL OR found_ssc_gpa IS NULL OR ABS(found_ssc_gpa - p_ssc_gpa) > 0.01 THEN
                target_user_id := NULL; -- Invalidate if GPA doesn't match
             END IF;
        END IF;

    ELSE
        -- Invalid method
        RETURN FALSE;
    END IF;

    -- 2. If no matching user is found, return false with a delay
    IF target_user_id IS NULL THEN
        PERFORM pg_sleep(1);
        RETURN FALSE;
    END IF;

    -- 3. Update the password in auth.users
    IF p_new_password IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
            updated_at = NOW(),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_app_meta_data = raw_app_meta_data || '{"provider": "email", "providers": ["email"]}'::jsonb
        WHERE id = target_user_id;
    END IF;

    -- 4. Return true to indicate success
    RETURN TRUE;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    body text NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_profile_id uuid,
    type text,
    read_at timestamp with time zone
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    question_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    topic text,
    chapter text,
    notes_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text,
    content text,
    shared_course_ids uuid[] DEFAULT '{}'::uuid[]
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    class_type text NOT NULL,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    video_url text,
    notes_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text[] DEFAULT '{}'::text[],
    topic text,
    button_text text,
    button_url text,
    shared_course_ids uuid[] DEFAULT '{}'::uuid[],
    archive_course_ids uuid[] DEFAULT '{}'::uuid[],
    chapter text,
    is_archive boolean DEFAULT false,
    is_archived boolean DEFAULT false,
    CONSTRAINT classes_class_type_check CHECK ((class_type = ANY (ARRAY['live'::text, 'recorded'::text])))
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text,
    name text NOT NULL,
    short_description text,
    full_description text,
    price numeric(10,2),
    what_you_get text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    bkash_number text,
    nagad_number text,
    contact_info text,
    is_public boolean DEFAULT true NOT NULL,
    demo_content jsonb DEFAULT '[]'::jsonb,
    original_price numeric(10,2),
    category text[] DEFAULT '{}'::text[],
    sub_category text[] DEFAULT '{}'::text[],
    priority integer DEFAULT 0,
    included_course_ids uuid[] DEFAULT '{}'::uuid[],
    sections text[] DEFAULT '{}'::text[],
    linked_course_ids uuid[] DEFAULT '{}'::uuid[]
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    course_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now(),
    valid_until timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: exam_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    question_id uuid NOT NULL,
    selected_option character(1),
    is_correct boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exam_answers_selected_option_check CHECK ((selected_option = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar])))
);


--
-- Name: exam_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    score numeric(10,2),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    attempt_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_number integer,
    answers jsonb,
    time_taken_seconds integer,
    total_marks numeric(10,2),
    violation_count integer DEFAULT 0
);


--
-- Name: exam_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    question_index integer NOT NULL,
    question_text text NOT NULL,
    option_a text NOT NULL,
    option_b text NOT NULL,
    option_c text NOT NULL,
    option_d text NOT NULL,
    correct_option character(1) NOT NULL,
    marks numeric(4,2) DEFAULT 1.00 NOT NULL,
    explanation text,
    question_type text,
    section text,
    CONSTRAINT exam_questions_correct_option_check CHECK ((correct_option = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar])))
);


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    exam_type text NOT NULL,
    duration_minutes integer NOT NULL,
    negative_mark_per_question numeric(4,2) DEFAULT 0 NOT NULL,
    total_marks numeric(10,2),
    instructions text,
    time_window_start timestamp with time zone,
    time_window_end timestamp with time zone,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text[] DEFAULT '{}'::text[],
    restrict_solution boolean DEFAULT false,
    chapter text,
    shared_course_ids uuid[] DEFAULT '{}'::uuid[],
    archive_course_ids uuid[] DEFAULT '{}'::uuid[],
    is_visible_on_free boolean DEFAULT true,
    category text[] DEFAULT '{}'::text[],
    is_archive boolean DEFAULT false,
    is_readymade boolean DEFAULT false,
    is_archived boolean DEFAULT false,
    readymade_course_ids uuid[] DEFAULT '{}'::uuid[],
    CONSTRAINT exams_exam_type_check CHECK ((exam_type = ANY (ARRAY['live'::text, 'practice'::text])))
);


--
-- Name: global_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: heroes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heroes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    cta_text text DEFAULT 'Get Started'::text,
    cta_link text DEFAULT '/courses'::text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    registration_id text NOT NULL,
    full_name text,
    phone text,
    school text,
    batch_year integer,
    extra_time_multiplier numeric(4,2) DEFAULT 1.00 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_second_timer boolean DEFAULT false,
    current_session_id text,
    father_name text,
    mother_name text,
    hsc_batch text,
    college_name text,
    ssc_gpa numeric,
    hsc_gpa numeric,
    status text DEFAULT 'active'::text,
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'banned'::text])))
);


--
-- Name: leaderboard_exam_attempts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.leaderboard_exam_attempts AS
 SELECT a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object('full_name', p.full_name, 'registration_id', p.registration_id, 'is_second_timer', p.is_second_timer) AS profile,
    a.attempt_number,
    a.time_taken_seconds
   FROM (public.exam_attempts a
     JOIN public.profiles p ON ((p.id = a.profile_id)));


--
-- Name: mentors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text,
    description text,
    image_url text,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: payment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    course_id uuid NOT NULL,
    trx_id text NOT NULL,
    phone text NOT NULL,
    payment_method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    promo_code_id uuid,
    CONSTRAINT payment_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'declined'::text])))
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_amount numeric NOT NULL,
    discount_type text DEFAULT 'flat'::text,
    course_id uuid,
    usage_limit integer,
    used_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT promo_codes_discount_type_check CHECK ((discount_type = ANY (ARRAY['flat'::text, 'percentage'::text])))
);


--
-- Name: question_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_text text NOT NULL,
    option_a text NOT NULL,
    option_b text NOT NULL,
    option_c text NOT NULL,
    option_d text NOT NULL,
    correct_option text NOT NULL,
    explanation text,
    tags text[] DEFAULT '{}'::text[],
    subject text,
    chapter text,
    topic text,
    exam_code text,
    year text,
    difficulty text DEFAULT 'medium'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT question_bank_correct_option_check CHECK ((correct_option = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])))
);


--
-- Name: reminder_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    remind_before_minutes integer DEFAULT 60 NOT NULL,
    remind_for_live_classes boolean DEFAULT true NOT NULL,
    remind_for_live_exams boolean DEFAULT true NOT NULL,
    remind_for_practice_exams boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    description text,
    resource_type text NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text,
    CONSTRAINT resources_resource_type_check CHECK ((resource_type = ANY (ARRAY['PDF'::text, 'Video'::text, 'Link'::text, 'Document'::text])))
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_name text NOT NULL,
    college_name text,
    review_text text NOT NULL,
    rating integer DEFAULT 5,
    is_featured boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    post_image_url text,
    gender text DEFAULT 'male'::text,
    image_url text,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    course_id uuid,
    title text NOT NULL,
    content text,
    media_urls text[] DEFAULT '{}'::text[],
    is_visible boolean DEFAULT true
);


--
-- Name: study_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    activity_type text NOT NULL,
    duration_seconds integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_note_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_note_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    note_id uuid NOT NULL,
    is_bookmarked boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    is_read boolean DEFAULT false,
    type text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: user_study_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_study_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stats jsonb DEFAULT '{}'::jsonb,
    flashcards jsonb DEFAULT '[]'::jsonb,
    todos jsonb DEFAULT '[]'::jsonb,
    streak_info jsonb DEFAULT '{"current_streak": 0, "last_study_date": null}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: bookmarks bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);


--
-- Name: bookmarks bookmarks_profile_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_profile_id_question_id_key UNIQUE (profile_id, question_id);


--
-- Name: class_notes class_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_notes
    ADD CONSTRAINT class_notes_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: courses courses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_slug_key UNIQUE (slug);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_profile_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_profile_id_course_id_key UNIQUE (profile_id, course_id);


--
-- Name: exam_answers exam_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_answers
    ADD CONSTRAINT exam_answers_pkey PRIMARY KEY (id);


--
-- Name: exam_attempts exam_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_attempts
    ADD CONSTRAINT exam_attempts_pkey PRIMARY KEY (id);


--
-- Name: exam_questions exam_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_questions
    ADD CONSTRAINT exam_questions_pkey PRIMARY KEY (id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: global_metadata global_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_metadata
    ADD CONSTRAINT global_metadata_pkey PRIMARY KEY (id);


--
-- Name: global_metadata global_metadata_type_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_metadata
    ADD CONSTRAINT global_metadata_type_value_key UNIQUE (type, value);


--
-- Name: heroes heroes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heroes
    ADD CONSTRAINT heroes_pkey PRIMARY KEY (id);


--
-- Name: mentors mentors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentors
    ADD CONSTRAINT mentors_pkey PRIMARY KEY (id);


--
-- Name: payment_requests payment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_requests
    ADD CONSTRAINT payment_requests_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_registration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_registration_id_key UNIQUE (registration_id);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: question_bank question_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_pkey PRIMARY KEY (id);


--
-- Name: reminder_preferences reminder_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_preferences
    ADD CONSTRAINT reminder_preferences_pkey PRIMARY KEY (id);


--
-- Name: reminder_preferences reminder_preferences_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_preferences
    ADD CONSTRAINT reminder_preferences_profile_id_key UNIQUE (profile_id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: study_activity_logs study_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_activity_logs
    ADD CONSTRAINT study_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: user_note_states user_note_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_note_states
    ADD CONSTRAINT user_note_states_pkey PRIMARY KEY (id);


--
-- Name: user_note_states user_note_states_profile_id_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_note_states
    ADD CONSTRAINT user_note_states_profile_id_note_id_key UNIQUE (profile_id, note_id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_study_data user_study_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_study_data
    ADD CONSTRAINT user_study_data_pkey PRIMARY KEY (id);


--
-- Name: user_study_data user_study_data_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_study_data
    ADD CONSTRAINT user_study_data_user_id_key UNIQUE (user_id);


--
-- Name: idx_classes_is_archive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_is_archive ON public.classes USING btree (is_archive);


--
-- Name: idx_exam_attempts_stats; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_attempts_stats ON public.exam_attempts USING btree (exam_id, attempt_type, score DESC);


--
-- Name: idx_exams_is_archive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_is_archive ON public.exams USING btree (is_archive);


--
-- Name: idx_global_metadata_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_metadata_type ON public.global_metadata USING btree (type);


--
-- Name: idx_question_bank_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_bank_chapter ON public.question_bank USING btree (chapter);


--
-- Name: idx_question_bank_exam_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_bank_exam_code ON public.question_bank USING btree (exam_code);


--
-- Name: idx_question_bank_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_bank_subject ON public.question_bank USING btree (subject);


--
-- Name: idx_question_bank_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_bank_topic ON public.question_bank USING btree (topic);


--
-- Name: idx_study_logs_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_study_logs_user_date ON public.study_activity_logs USING btree (user_id, created_at);


--
-- Name: payment_requests on_payment_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_payment_status_change AFTER UPDATE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION public.handle_payment_status_change();


--
-- Name: payment_requests trigger_auto_approve_promo_before; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_approve_promo_before BEFORE INSERT ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION public.handle_promo_payment_request();


--
-- Name: payment_requests trigger_handle_approved_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_handle_approved_insert AFTER INSERT ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION public.handle_approved_payment_insert();


--
-- Name: user_study_data update_user_study_data_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_study_data_updated_at BEFORE UPDATE ON public.user_study_data FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: announcements announcements_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: announcements announcements_recipient_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_recipient_profile_id_fkey FOREIGN KEY (recipient_profile_id) REFERENCES public.profiles(id);


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: bookmarks bookmarks_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.exam_questions(id) ON DELETE CASCADE;


--
-- Name: class_notes class_notes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_notes
    ADD CONSTRAINT class_notes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: classes classes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: exam_answers exam_answers_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_answers
    ADD CONSTRAINT exam_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.exam_attempts(id) ON DELETE CASCADE;


--
-- Name: exam_answers exam_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_answers
    ADD CONSTRAINT exam_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.exam_questions(id) ON DELETE CASCADE;


--
-- Name: exam_attempts exam_attempts_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_attempts
    ADD CONSTRAINT exam_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_attempts exam_attempts_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_attempts
    ADD CONSTRAINT exam_attempts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: exam_questions exam_questions_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_questions
    ADD CONSTRAINT exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exams exams_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: payment_requests payment_requests_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_requests
    ADD CONSTRAINT payment_requests_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: payment_requests payment_requests_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_requests
    ADD CONSTRAINT payment_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: payment_requests payment_requests_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_requests
    ADD CONSTRAINT payment_requests_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: reminder_preferences reminder_preferences_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_preferences
    ADD CONSTRAINT reminder_preferences_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: resources resources_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: routines routines_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: study_activity_logs study_activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_activity_logs
    ADD CONSTRAINT study_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_note_states user_note_states_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_note_states
    ADD CONSTRAINT user_note_states_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.class_notes(id) ON DELETE CASCADE;


--
-- Name: user_note_states user_note_states_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_note_states
    ADD CONSTRAINT user_note_states_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_notifications user_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_study_data user_study_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_study_data
    ADD CONSTRAINT user_study_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles Admins can do everything on profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do everything on profiles" ON public.profiles TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: courses Admins can manage all courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all courses" ON public.courses USING (public.is_admin());


--
-- Name: enrollments Admins can manage all enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all enrollments" ON public.enrollments USING (public.is_admin());


--
-- Name: profiles Admins can manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all profiles" ON public.profiles USING (public.is_admin());


--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles USING (public.is_admin());


--
-- Name: app_settings Admins can manage app settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage app settings" ON public.app_settings USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courses Admins can manage courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage courses" ON public.courses USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: enrollments Admins can manage enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage enrollments" ON public.enrollments USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: resources Admins can manage resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage resources" ON public.resources USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: reviews Admins can manage reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage reviews" ON public.reviews USING ((( SELECT user_roles.role
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())) = 'admin'::public.app_role)) WITH CHECK ((( SELECT user_roles.role
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())) = 'admin'::public.app_role));


--
-- Name: app_settings Admins can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage settings" ON public.app_settings USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: payment_requests Admins can update all payment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all payment requests" ON public.payment_requests FOR UPDATE USING (public.is_admin());


--
-- Name: payment_requests Admins can view all payment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment requests" ON public.payment_requests FOR SELECT USING (public.is_admin());


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: announcements Admins manage announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage announcements" ON public.announcements TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: class_notes Admins manage class notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage class notes" ON public.class_notes TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: classes Admins manage classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage classes" ON public.classes TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courses Admins manage courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage courses" ON public.courses TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: enrollments Admins manage enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage enrollments" ON public.enrollments USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: exam_answers Admins manage exam answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage exam answers" ON public.exam_answers USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: exam_attempts Admins manage exam attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage exam attempts" ON public.exam_attempts USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: exam_questions Admins manage exam questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage exam questions" ON public.exam_questions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: exams Admins manage exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage exams" ON public.exams TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: resources Admins manage resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage resources" ON public.resources TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: routines Admins/Teachers can delete routines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/Teachers can delete routines" ON public.routines FOR DELETE USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'teacher'::public.app_role])))));


--
-- Name: routines Admins/Teachers can insert routines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/Teachers can insert routines" ON public.routines FOR INSERT WITH CHECK ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'teacher'::public.app_role])))));


--
-- Name: routines Admins/Teachers can update routines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/Teachers can update routines" ON public.routines FOR UPDATE USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'teacher'::public.app_role])))));


--
-- Name: heroes Allow admin full access to heroes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin full access to heroes" ON public.heroes USING (( SELECT public.is_admin() AS is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())));


--
-- Name: mentors Allow admin full access to mentors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin full access to mentors" ON public.mentors USING (( SELECT public.is_admin() AS is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())));


--
-- Name: promo_codes Allow admin full access to promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin full access to promo codes" ON public.promo_codes USING (( SELECT public.is_admin() AS is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())));


--
-- Name: reviews Allow admin full access to reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin full access to reviews" ON public.reviews USING (( SELECT public.is_admin() AS is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())));


--
-- Name: heroes Allow public read access to active heroes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to active heroes" ON public.heroes FOR SELECT USING ((is_active = true));


--
-- Name: promo_codes Allow public read access to active promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to active promo codes" ON public.promo_codes FOR SELECT USING ((is_active = true));


--
-- Name: mentors Allow public read access to mentors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to mentors" ON public.mentors FOR SELECT USING (true);


--
-- Name: reviews Allow public read access to reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to reviews" ON public.reviews FOR SELECT USING (true);


--
-- Name: announcements Announcements viewable to authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements viewable to authenticated users" ON public.announcements FOR SELECT TO authenticated USING (true);


--
-- Name: app_settings Anyone can read app settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT USING (true);


--
-- Name: courses Anyone can view active courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active courses" ON public.courses FOR SELECT USING (true);


--
-- Name: exam_attempts Authenticated users can view all attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all attempts" ON public.exam_attempts FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: announcements Authenticated users can view announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view announcements" ON public.announcements FOR SELECT USING (((auth.role() = 'authenticated'::text) AND ((recipient_profile_id IS NULL) OR (recipient_profile_id = auth.uid()))));


--
-- Name: classes Authenticated users can view classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view classes" ON public.classes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: exam_questions Authenticated users can view exam questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view exam questions" ON public.exam_questions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: exams Authenticated users can view exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view exams" ON public.exams FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: exams Authenticated users can view published exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view published exams" ON public.exams FOR SELECT TO authenticated USING ((is_published = true));


--
-- Name: resources Authenticated users can view resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view resources" ON public.resources FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: exam_questions Authenticated users view questions of published exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users view questions of published exams" ON public.exam_questions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.exams e
  WHERE ((e.id = exam_questions.exam_id) AND (e.is_published = true)))));


--
-- Name: class_notes Class notes viewable to authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Class notes viewable to authenticated users" ON public.class_notes FOR SELECT TO authenticated USING (true);


--
-- Name: courses Courses are viewable to authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Courses are viewable to authenticated users" ON public.courses FOR SELECT TO authenticated USING (true);


--
-- Name: courses Public can view courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view courses" ON public.courses FOR SELECT USING (true);


--
-- Name: global_metadata Public can view global metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view global metadata" ON public.global_metadata FOR SELECT USING (true);


--
-- Name: exams Public can view public exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view public exams" ON public.exams FOR SELECT TO anon USING (((course_id IS NULL) AND (is_published = true)));


--
-- Name: app_settings Public can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view settings" ON public.app_settings FOR SELECT USING (true);


--
-- Name: classes Public classes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public classes are viewable by everyone" ON public.classes FOR SELECT USING (true);


--
-- Name: exams Public exams are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public exams are viewable by everyone" ON public.exams FOR SELECT TO authenticated, anon USING ((course_id IS NULL));


--
-- Name: class_notes Public notes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public notes are viewable by everyone" ON public.class_notes FOR SELECT TO authenticated, anon USING ((course_id IS NULL));


--
-- Name: reviews Public reviews are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);


--
-- Name: resources Resources viewable to authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Resources viewable to authenticated users" ON public.resources FOR SELECT TO authenticated USING (true);


--
-- Name: routines Routines are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Routines are viewable by everyone" ON public.routines FOR SELECT USING (true);


--
-- Name: announcements Staff can delete announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete announcements" ON public.announcements FOR DELETE USING (public.is_staff());


--
-- Name: classes Staff can delete classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete classes" ON public.classes FOR DELETE USING (public.is_staff());


--
-- Name: exams Staff can delete exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete exams" ON public.exams FOR DELETE USING (public.is_staff());


--
-- Name: resources Staff can delete resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete resources" ON public.resources FOR DELETE USING (public.is_staff());


--
-- Name: announcements Staff can insert announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert announcements" ON public.announcements FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: classes Staff can insert classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert classes" ON public.classes FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: exams Staff can insert exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert exams" ON public.exams FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: resources Staff can insert resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert resources" ON public.resources FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: class_notes Staff can manage class_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage class_notes" ON public.class_notes USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: global_metadata Staff can manage global metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage global metadata" ON public.global_metadata USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: question_bank Staff can manage question bank; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage question bank" ON public.question_bank USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: announcements Staff can update announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update announcements" ON public.announcements FOR UPDATE USING (public.is_staff());


--
-- Name: classes Staff can update classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update classes" ON public.classes FOR UPDATE USING (public.is_staff());


--
-- Name: exams Staff can update exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update exams" ON public.exams FOR UPDATE USING (public.is_staff());


--
-- Name: resources Staff can update resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update resources" ON public.resources FOR UPDATE USING (public.is_staff());


--
-- Name: class_notes Students can view enrolled class_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view enrolled class_notes" ON public.class_notes FOR SELECT USING ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.course_id = class_notes.course_id) AND (e.profile_id = auth.uid()))))));


--
-- Name: enrollments Students can view their own enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own enrollments" ON public.enrollments FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: courses Teachers can view courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view courses" ON public.courses FOR SELECT USING (public.is_teacher());


--
-- Name: exam_answers User can insert answers for own attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can insert answers for own attempts" ON public.exam_answers FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.exam_attempts a
  WHERE ((a.id = exam_answers.attempt_id) AND (a.profile_id = auth.uid())))));


--
-- Name: exam_attempts User can insert own exam attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can insert own exam attempts" ON public.exam_attempts FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: reminder_preferences User can manage own reminder preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can manage own reminder preferences" ON public.reminder_preferences USING ((auth.uid() = profile_id)) WITH CHECK ((auth.uid() = profile_id));


--
-- Name: exam_answers User can view answers of own attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view answers of own attempts" ON public.exam_answers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.exam_attempts a
  WHERE ((a.id = exam_answers.attempt_id) AND (a.profile_id = auth.uid())))));


--
-- Name: enrollments User can view own enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view own enrollments" ON public.enrollments FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: exam_attempts User can view own exam attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view own exam attempts" ON public.exam_attempts FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: reminder_preferences User can view own reminder preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view own reminder preferences" ON public.reminder_preferences FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: user_notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.user_notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: exam_attempts Users can insert own attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own attempts" ON public.exam_attempts FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: study_activity_logs Users can insert own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own logs" ON public.study_activity_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_note_states Users can insert own note states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own note states" ON public.user_note_states FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: payment_requests Users can insert own payment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own payment requests" ON public.payment_requests FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: user_study_data Users can insert own study data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own study data" ON public.user_study_data FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: bookmarks Users can manage own bookmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own bookmarks" ON public.bookmarks USING ((auth.uid() = profile_id));


--
-- Name: reminder_preferences Users can manage own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own reminders" ON public.reminder_preferences USING ((auth.uid() = profile_id));


--
-- Name: user_note_states Users can update own note states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own note states" ON public.user_note_states FOR UPDATE USING ((auth.uid() = profile_id));


--
-- Name: user_notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: user_study_data Users can update own study data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own study data" ON public.user_study_data FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: enrollments Users can view own enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT USING ((profile_id = auth.uid()));


--
-- Name: study_activity_logs Users can view own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own logs" ON public.study_activity_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_note_states Users can view own note states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own note states" ON public.user_note_states FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: user_notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.user_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payment_requests Users can view own payment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own payment requests" ON public.payment_requests FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_study_data Users can view own study data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own study data" ON public.user_study_data FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: class_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

--
-- Name: global_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.global_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: heroes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.heroes ENABLE ROW LEVEL SECURITY;

--
-- Name: mentors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: question_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: routines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

--
-- Name: study_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.study_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_note_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_note_states ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_study_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_study_data ENABLE ROW LEVEL SECURITY;


