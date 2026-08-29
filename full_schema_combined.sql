-- ===== 20260101010000_full_website_migration.sql =====

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




-- ===== 20260201000000_fix_teacher_and_analytics.sql =====
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


-- ===== 20260205000000_community_and_exam_updates.sql =====
-- 1. Add shared_course_ids to resources
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS shared_course_ids uuid[] DEFAULT '{}'::uuid[];

-- 2. Create get_student_community_links RPC (Secure & Expanded for Shared Courses)
DROP FUNCTION IF EXISTS get_student_community_links(uuid);
DROP FUNCTION IF EXISTS get_student_community_links();

CREATE OR REPLACE FUNCTION get_student_community_links()
RETURNS TABLE (
  id uuid,
  title text,
  url text,
  description text,
  resource_type text,
  course_id uuid,
  course_name text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  -- 1. Resources linked to Enrolled Courses (Primary OR Shared)
  -- This joins resources with the user's enrollments to generate a row per enrolled course context
  SELECT
    r.id,
    r.title,
    r.url,
    r.description,
    r.resource_type,
    c.id as course_id,
    c.name as course_name,
    r.created_at
  FROM enrollments e
  JOIN courses c ON e.course_id = c.id
  JOIN resources r ON (
      r.course_id = c.id -- Resource belongs to this course primarily
      OR
      c.id = ANY(r.shared_course_ids) -- Resource is shared with this course
  )
  WHERE e.profile_id = v_user_id
  AND r.resource_type = 'Link'

  UNION ALL

  -- 2. Public Resources (Not tied to any specific course)
  SELECT
    r.id,
    r.title,
    r.url,
    r.description,
    r.resource_type,
    NULL::uuid as course_id,
    'Public Community'::text as course_name,
    r.created_at
  FROM resources r
  WHERE r.resource_type = 'Link'
  AND r.course_id IS NULL

  ORDER BY created_at DESC;
END;
$$;

-- 3. Replace submit_exam_attempt with updated Second Timer Logic
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb, p_violation_count integer DEFAULT 0, p_time_taken_seconds integer DEFAULT 0) RETURNS uuid
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
        ELSE
            -- Default 1 mark deduction for 30 questions or ANY other amount below 50
            -- This satisfies the requirement "less than 30 will also get deduction same like 30 marks"
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


-- ===== 20260218000000_add_video_url_to_courses.sql =====
ALTER TABLE courses ADD COLUMN IF NOT EXISTS video_url text;


-- ===== 20260226000000_add_question_reports.sql =====
create table question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references exam_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_text text not null,
  suggested_correct_option text,
  created_at timestamptz default now(),
  status text default 'pending' check (status in ('pending', 'resolved', 'ignored'))
);

-- RLS
alter table question_reports enable row level security;

-- Users can insert their own reports
create policy "Users can insert their own reports"
  on question_reports for insert
  with check (auth.uid() = user_id);

-- Admins can view all reports
create policy "Admins can view all reports"
  on question_reports for select
  using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  );

-- Admins can delete reports (when resolved/declined)
create policy "Admins can delete reports"
  on question_reports for delete
  using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  );


-- ===== 20260226010000_fix_reports_fk.sql =====
-- Fix FK to reference public.profiles instead of auth.users
alter table question_reports
drop constraint if exists question_reports_user_id_fkey;

alter table question_reports
add constraint question_reports_user_id_fkey
foreign key (user_id)
references public.profiles(id)
on delete cascade;


-- ===== 20260305170537_add_access_unlimited_practice_to_courses.sql =====
ALTER TABLE courses ADD COLUMN IF NOT EXISTS access_unlimited_practice boolean DEFAULT false;

-- ===== 20260306000000_add_external_exam_link.sql =====
ALTER TABLE public.exams ADD COLUMN external_exam_link text;


-- ===== 20260307000000_update_exam_questions_fields.sql =====
-- Add new columns to exam_questions table to support extended metadata from JSON imports
ALTER TABLE public.exam_questions
ADD COLUMN IF NOT EXISTS subject text,
ADD COLUMN IF NOT EXISTS chapter text,
ADD COLUMN IF NOT EXISTS topic text,
ADD COLUMN IF NOT EXISTS exam_code text,
ADD COLUMN IF NOT EXISTS year text,
ADD COLUMN IF NOT EXISTS difficulty text,
ADD COLUMN IF NOT EXISTS tags text[];


-- ===== 20260310000000_add_is_omr_to_exams.sql =====
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_omr BOOLEAN DEFAULT false;


-- ===== 20260310000000_coupon_system_updates.sql =====
-- Coupon System Updates: Multi-course support, case-insensitive matching, special discount text, usage count fix

-- 1. Add new columns to promo_codes
ALTER TABLE public.promo_codes 
  ADD COLUMN IF NOT EXISTS course_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS special_discount_text text,
  ADD COLUMN IF NOT EXISTS special_discount_deadline timestamptz;

-- 2. Migrate existing course_id data to course_ids array
UPDATE public.promo_codes 
SET course_ids = ARRAY[course_id::text] 
WHERE course_id IS NOT NULL AND (course_ids IS NULL OR course_ids = '{}');

-- 3. Replace check_promo_code function with case-insensitive version + usage count increment
CREATE OR REPLACE FUNCTION public.check_promo_code(p_code text, p_course_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_promo record;
BEGIN
    -- Case-insensitive code matching, check both course_id (legacy) and course_ids (new)
    SELECT * INTO v_promo FROM public.promo_codes 
    WHERE LOWER(code) = LOWER(p_code) 
      AND is_active = true 
      AND (
        course_id IS NULL 
        OR course_id = p_course_id
        OR p_course_id::text = ANY(course_ids)
        OR course_ids = '{}'
        OR course_ids IS NULL
      );

    IF v_promo IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Invalid promo code');
    END IF;

    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Promo code usage limit exceeded');
    END IF;

    -- Increment usage count
    UPDATE public.promo_codes SET used_count = COALESCE(used_count, 0) + 1 WHERE id = v_promo.id;

    RETURN jsonb_build_object(
        'valid', true,
        'discount_amount', v_promo.discount_amount,
        'discount_type', v_promo.discount_type,
        'id', v_promo.id,
        'code', v_promo.code
    );
END;
$$;

-- 4. Create RPC to get special discounts for a course
CREATE OR REPLACE FUNCTION public.get_special_discounts(p_course_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'code', pc.code,
            'discount_amount', pc.discount_amount,
            'discount_type', pc.discount_type,
            'special_discount_text', pc.special_discount_text,
            'special_discount_deadline', pc.special_discount_deadline
        )
    ) INTO v_result
    FROM public.promo_codes pc
    WHERE pc.is_active = true
      AND pc.special_discount_text IS NOT NULL
      AND pc.special_discount_text != ''
      AND (
        pc.course_id IS NULL
        OR pc.course_id = p_course_id
        OR p_course_id::text = ANY(pc.course_ids)
      )
      AND (pc.special_discount_deadline IS NULL OR pc.special_discount_deadline > NOW())
      AND (pc.usage_limit IS NULL OR pc.used_count < pc.usage_limit);

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ===== 20260310000001_leaderboard_view_columns.sql =====
-- Drop the existing view
DROP VIEW IF EXISTS public.leaderboard_exam_attempts;

-- Recreate the view with the missing profile columns
CREATE VIEW public.leaderboard_exam_attempts AS
 SELECT a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object(
      'full_name', p.full_name, 
      'registration_id', p.registration_id, 
      'is_second_timer', p.is_second_timer,
      'hsc_batch', p.hsc_batch,
      'college_name', p.college_name,
      'school', p.school
    ) AS profile,
    a.attempt_number,
    a.time_taken_seconds
   FROM (public.exam_attempts a
     JOIN public.profiles p ON ((p.id = a.profile_id)));


-- ===== 20260316194550_add_readymade_topic_to_exams.sql =====
ALTER TABLE "public"."exams" ADD COLUMN "readymade_topic" text;


-- ===== 20260317002150_add_sort_order_to_classes.sql =====
ALTER TABLE "public"."classes" ADD COLUMN "sort_order" integer DEFAULT 0;


-- ===== 20260319000000_add_routine_url_to_courses.sql =====
ALTER TABLE "public"."courses" ADD COLUMN IF NOT EXISTS "routine_url" text;


-- ===== 20260319000001_enhance_reviews.sql =====
-- Alter reviews table to add category and images
ALTER TABLE public.reviews 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'General',
ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- Create class_views table for attendance tracking
CREATE TABLE IF NOT EXISTS public.class_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT class_views_profile_id_class_id_key UNIQUE (profile_id, class_id)
);

-- RLS for class_views
ALTER TABLE public.class_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own class views" 
ON public.class_views FOR SELECT 
USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own class views" 
ON public.class_views FOR INSERT 
WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Admins can view all class views" 
ON public.class_views FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')));


-- ===== 20260321000001_add_warnings_to_leaderboard.sql =====
-- Drop the existing view
DROP VIEW IF EXISTS public.leaderboard_exam_attempts;

-- Recreate the view with the missing profile columns and the new violation_count column
CREATE OR REPLACE VIEW public.leaderboard_exam_attempts AS
 SELECT a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object(
      'full_name', p.full_name, 
      'registration_id', p.registration_id, 
      'is_second_timer', p.is_second_timer,
      'hsc_batch', p.hsc_batch,
      'college_name', p.college_name,
      'school', p.school
    ) AS profile,
    a.attempt_number,
    a.time_taken_seconds,
    a.violation_count
   FROM (public.exam_attempts a
     JOIN public.profiles p ON ((p.id = a.profile_id)));


-- ===== 20260322000000_add_special_exam_cards_and_exam_settings.sql =====
-- Create special_exam_cards table
CREATE TABLE IF NOT EXISTS public.special_exam_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    details TEXT,
    instructions TEXT,
    image_url TEXT,
    action_link TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE public.special_exam_cards ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on special_exam_cards" 
    ON public.special_exam_cards FOR SELECT USING (true);

-- Allow admin write access (using the same policy style as heroes/mentors)
CREATE POLICY "Allow admin all access on special_exam_cards" 
    ON public.special_exam_cards FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
      )
    );

-- Add disable_second_timer_deduction to exams table
ALTER TABLE public.exams
    ADD COLUMN IF NOT EXISTS disable_second_timer_deduction BOOLEAN DEFAULT false;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ===== 20260322000001_update_second_timer_logic.sql =====
-- Update submit_exam_attempt with updated Second Timer Logic (checking disable_second_timer_deduction)
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb, p_violation_count integer DEFAULT 0, p_time_taken_seconds integer DEFAULT 0) RETURNS uuid
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
    v_disable_second_timer_deduction BOOLEAN := false;
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

    -- Get Exam Details
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end, COALESCE(disable_second_timer_deduction, false)
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end, v_disable_second_timer_deduction
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

    IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
        -- Calculate question count for the exam
        SELECT count(*) INTO v_question_count
        FROM public.exam_questions
        WHERE exam_id = p_exam_id;

        -- Use question count for deduction logic
        IF v_question_count >= 100 THEN
            v_deduction := 3;
        ELSIF v_question_count >= 50 THEN
            v_deduction := 1.5;
        ELSE
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
        v_exam_total_marks,
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


-- ===== 20260322000002_fix_exam_calculation.sql =====
-- Fix submit_exam_attempt marks calculation logic 
-- Reverting total_marks back to total_score and restoring ELSIF for question count >= 30
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb, p_violation_count integer DEFAULT 0, p_time_taken_seconds integer DEFAULT 0) RETURNS uuid
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
    v_disable_second_timer_deduction BOOLEAN := false;
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
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0), exam_type, time_window_end, COALESCE(disable_second_timer_deduction, false)
    INTO v_negative_mark, v_exam_total_marks, v_exam_type, v_time_window_end, v_disable_second_timer_deduction
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

    IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
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

-- Notify schema
NOTIFY pgrst, 'reload schema';


-- ===== 20260322000003_add_only_live_exams.sql =====
-- Migration: Add is_only_live to exams table
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_only_live BOOLEAN DEFAULT false;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';


-- ===== 20260322000004_add_recalculate_results.sql =====
-- Function to recalculate all scores for an exam if the answer key is updated
CREATE OR REPLACE FUNCTION public.recalculate_exam_results(p_exam_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_attempt record;
    v_answer record;
    v_raw_score NUMERIC := 0;
    v_negative_mark NUMERIC;
    v_is_second_timer BOOLEAN;
    v_question_marks NUMERIC;
    v_correct_option TEXT;
    v_deduction NUMERIC := 0;
    v_question_count INTEGER := 0;
    v_disable_second_timer_deduction BOOLEAN := false;
BEGIN
    -- 1. Get Exam Details
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(disable_second_timer_deduction, false)
    INTO v_negative_mark, v_disable_second_timer_deduction
    FROM public.exams
    WHERE id = p_exam_id;

    -- 2. Get Question Count once for second timer logic
    SELECT count(*) INTO v_question_count
    FROM public.exam_questions
    WHERE exam_id = p_exam_id;

    -- 3. Loop through all attempts for this exam
    FOR v_attempt IN SELECT id, profile_id, answers FROM public.exam_attempts WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;
        v_deduction := 0;

        -- 4. Recalculate Raw Score from answers
        FOR v_answer IN SELECT * FROM jsonb_to_recordset(v_attempt.answers) AS x(question_id UUID, selected_option TEXT)
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

        -- 5. Second Timer Logic
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            IF v_question_count >= 100 THEN
                v_deduction := 3;
            ELSIF v_question_count >= 50 THEN
                v_deduction := 1.5;
            ELSIF v_question_count >= 30 THEN
                v_deduction := 1;
            END IF;
        END IF;

        -- 6. Update the attempt record
        UPDATE public.exam_attempts 
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;
    END LOOP;
END;
$$;

-- Allow admins to execute this
GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO service_role;


-- ===== 20260323000000_auth_and_registration_updates.sql =====
-- 1. Add tracking for 1-time email change
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_changed_email BOOLEAN DEFAULT FALSE;

-- 2. Create the auth user creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    registration_id,
    full_name,
    father_name,
    mother_name,
    phone,
    hsc_batch,
    college_name,
    ssc_gpa,
    hsc_gpa,
    is_second_timer,
    extra_time_multiplier
  )
  VALUES (
    new.id,
    -- User's phone acts as their registration ID currently
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'father_name',
    new.raw_user_meta_data->>'mother_name',
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'hsc_batch',
    new.raw_user_meta_data->>'college_name',
    COALESCE((new.raw_user_meta_data->>'ssc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'hsc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'is_second_timer')::boolean, false),
    1
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Create RPC for admins to reset user passwords
CREATE OR REPLACE FUNCTION public.admin_reset_password(p_user_id UUID, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Ensure password has sufficient length
  IF length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;


-- ===== 20260323000001_admin_update_email_rpc.sql =====
-- Create a secure function to force-update a user's email
-- This function must be run by an authenticated user with the 'admin' role
CREATE OR REPLACE FUNCTION public.admin_update_user_email(
  p_user_id UUID,
  p_new_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to access auth schema
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. Security Check: Only allow admins to call this
  v_caller_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_caller_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can force-update user emails.';
  END IF;

  -- 2. Validate the new email isn't already taken
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_new_email) THEN
    RAISE EXCEPTION 'This email is already registered to another account.';
  END IF;

  -- 3. Update the auth.users table directly
  UPDATE auth.users
  SET 
    email = p_new_email,
    email_confirmed_at = now(), -- Mark as verified immediately
    updated_at = now(),
    email_change = '', -- Clear any pending changes with empty string (avoid NULL scan error)
    email_change_sent_at = NULL
  WHERE id = p_user_id;

  -- 4. Mark the one-time flag in the profiles table as used
  UPDATE public.profiles
  SET has_changed_email = true
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Email updated successfully to ' || p_new_email);
END;
$$;

-- Grant access to authenticated users (logic check inside function handles admin-only)
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(UUID, TEXT) TO authenticated;


-- ===== 20260323000002_admin_delete_user_rpc.sql =====
-- Create a secure function to deep-delete a user
-- This function must be run by an authenticated user with the 'admin' role
-- It deletes the user from auth.users, which cascades to public.profiles and other tables
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to access auth schema
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. Security Check: Only allow admins to call this
  v_caller_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_caller_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can delete users.';
  END IF;

  -- 2. Delete the user from auth.users
  -- This will cascade to public.profiles, enrollments, etc. due to ON DELETE CASCADE
  DELETE FROM auth.users
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully from everywhere.');
END;
$$;

-- Grant access to authenticated users (logic check inside function handles admin-only)
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;


-- ===== 20260323000003_admin_bulk_delete_users_rpc.sql =====
-- Create a secure function to bulk-delete users
-- This function must be run by an authenticated user with the 'admin' role
-- It deletes multiple users from auth.users, which cascades to public.profiles and other tables
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_users(
  p_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to access auth schema
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. Security Check: Only allow admins to call this
  v_caller_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_caller_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can bulk-delete users.';
  END IF;

  -- 2. Delete the users from auth.users
  -- This will cascade to public.profiles, enrollments, etc. due to ON DELETE CASCADE
  DELETE FROM auth.users
  WHERE id = ANY(p_user_ids);

  RETURN jsonb_build_object(
      'success', true, 
      'message', array_length(p_user_ids, 1) || ' users deleted successfully from everywhere.'
  );
END;
$$;

-- Grant access to authenticated users (logic check inside function handles admin-only)
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_users(UUID[]) TO authenticated;


-- ===== 20260325000000_update_special_announcements.sql =====
-- Migration: Update special_exam_cards table to include button_text
ALTER TABLE public.special_exam_cards
ADD COLUMN IF NOT EXISTS button_text TEXT DEFAULT 'বিস্তারিত দেখুন';

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ===== 20260325010000_add_card_type_to_special_exam_cards.sql =====
-- Add card_type column to special_exam_cards to differentiate between exam cards and announcement cards
ALTER TABLE public.special_exam_cards
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'exam' CHECK (card_type IN ('exam', 'announcement'));


-- ===== 20260328000000_add_omr_credentials.sql =====
-- Add OMR credential columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS omr_roll_no TEXT,
  ADD COLUMN IF NOT EXISTS omr_reg_no TEXT;

-- Unique constraints
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_omr_roll_no_unique UNIQUE (omr_roll_no);
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_omr_reg_no_unique UNIQUE (omr_reg_no);

-- RPC function to generate unique 6-digit OMR credentials
CREATE OR REPLACE FUNCTION public.generate_omr_credentials()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_roll text;
  v_reg text;
  v_existing_roll text;
  v_existing_reg text;
BEGIN
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check if already generated
  SELECT omr_roll_no, omr_reg_no 
  INTO v_existing_roll, v_existing_reg 
  FROM profiles WHERE id = v_user_id;

  IF v_existing_roll IS NOT NULL AND v_existing_reg IS NOT NULL THEN
    RETURN json_build_object(
      'omr_roll_no', v_existing_roll,
      'omr_reg_no', v_existing_reg,
      'already_generated', true
    );
  END IF;

  -- Generate unique 6-digit roll number
  LOOP
    v_roll := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE omr_roll_no = v_roll);
  END LOOP;

  -- Generate unique 6-digit reg number  
  LOOP
    v_reg := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE omr_reg_no = v_reg);
  END LOOP;

  -- Save
  UPDATE profiles 
  SET omr_roll_no = v_roll, omr_reg_no = v_reg 
  WHERE id = v_user_id;

  RETURN json_build_object(
    'omr_roll_no', v_roll,
    'omr_reg_no', v_reg,
    'already_generated', false
  );
END;
$$;


-- ===== 20260402000000_fix_handle_new_user_trigger.sql =====
-- Fix handle_new_user trigger to gracefully handle duplicate registration_ids.
-- Previously, if two students registered with the same phone number, the UNIQUE constraint
-- on registration_id would cause the trigger to crash with "Database error saving new user".
-- This fix uses ON CONFLICT to update the existing profile row instead of failing.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    registration_id,
    full_name,
    father_name,
    mother_name,
    phone,
    hsc_batch,
    college_name,
    ssc_gpa,
    hsc_gpa,
    is_second_timer,
    extra_time_multiplier
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, new.id::text),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'father_name',
    new.raw_user_meta_data->>'mother_name',
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'hsc_batch',
    new.raw_user_meta_data->>'college_name',
    COALESCE((new.raw_user_meta_data->>'ssc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'hsc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'is_second_timer')::boolean, false),
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    father_name = EXCLUDED.father_name,
    mother_name = EXCLUDED.mother_name,
    phone = EXCLUDED.phone,
    hsc_batch = EXCLUDED.hsc_batch,
    college_name = EXCLUDED.college_name,
    ssc_gpa = EXCLUDED.ssc_gpa,
    hsc_gpa = EXCLUDED.hsc_gpa,
    is_second_timer = EXCLUDED.is_second_timer;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== 20260416000000_add_admin_insert_notifications.sql =====
-- Allow admins to insert notifications to send messages to users
create policy "Admins can insert notifications"
  on user_notifications for insert
  with check (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  );


-- ===== 20260425000000_add_payment_details_fields.sql =====
-- Add new fields to payment_requests table
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS amount_sent numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS due_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS due_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sender_last5 text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_link text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_number text DEFAULT NULL;

-- Add column for tracking due payments (partial payments)
-- updated_at already exists but ensure it's present
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add a note field for admin comments
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS admin_note text DEFAULT NULL;

-- Add amount_paid to track EMI payments (amount paid so far, less than total)
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT NULL;

-- Add routine course_ids array for multi-course routine support
ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS course_ids uuid[] DEFAULT '{}';


-- ===== 20260425000001_add_admin_get_user_email.sql =====
-- Add RPC to get user email (admin only)
CREATE OR REPLACE FUNCTION public.admin_get_user_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  RETURN v_email;
END;
$$;


-- ===== 20260425000002_add_emi_logs.sql =====
-- EMI Logs table for tracking individual partial payment transactions
CREATE TABLE IF NOT EXISTS public.emi_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  admin_note text,
  recorded_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.emi_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only emi_logs" ON public.emi_logs
  USING (public.is_admin());


-- ===== 20260425000003_add_is_hidden_courses.sql =====
-- Add is_hidden column to courses for hiding without deactivating
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false NOT NULL;


-- ===== 20260425000004_add_admin_confirm_email.sql =====
-- Add admin RPC to confirm student email manually
CREATE OR REPLACE FUNCTION public.admin_confirm_user_email(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = p_user_id;
END;
$$;


-- ===== 20260425000005_add_sort_orders.sql =====
-- Add sort_order columns to classes and exams for drag-and-drop ordering
-- Classes: per-course sort, free sort
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS archive_sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS free_sort_order integer DEFAULT 0 NOT NULL;

-- Exams: per-course sort, archive/readymade/free per-chapter sort
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS archive_sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS readymade_sort_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS free_sort_order integer DEFAULT 0 NOT NULL;


-- ===== 20260425000006_add_readymade_category.sql =====
-- Add HSC board category fields to exams for readymade section
-- Structure: Category (Board) → Subject → Chapter → Sub-chapter (Session/Year) → Exam (per board)
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS readymade_category text DEFAULT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS readymade_sub_chapter text DEFAULT NULL;

-- Also index for faster filtering
CREATE INDEX IF NOT EXISTS idx_exams_readymade_category ON public.exams(readymade_category) WHERE is_readymade = true;


-- ===== 20260426000001_enrollment_expiry_and_fixes.sql =====
-- ====================================================================
-- Migration: Enrollment Expiry + Community Fix (Direct Enrollments Only)
-- Run this in Supabase SQL Editor
-- ====================================================================

-- 1. Add expires_at column to enrollments (safe - no error if exists)
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;

-- 2. Add index for faster expiry checks
CREATE INDEX IF NOT EXISTS idx_enrollments_expires_at 
  ON public.enrollments(expires_at) WHERE expires_at IS NOT NULL;

-- 3. Replace get_student_community_links to:
--    a) Only return communities from DIRECTLY enrolled courses (not bonus/linked courses)
--    b) Respect enrollment expiry
DROP FUNCTION IF EXISTS get_student_community_links(uuid);
DROP FUNCTION IF EXISTS get_student_community_links();

CREATE OR REPLACE FUNCTION get_student_community_links()
RETURNS TABLE (
  id uuid,
  title text,
  url text,
  description text,
  resource_type text,
  course_id uuid,
  course_name text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  -- Only resources from DIRECTLY enrolled courses (the enrollments table rows)
  -- This intentionally does NOT follow linked_course_ids / bonus courses
  -- Community should only appear for the course the student explicitly paid for
  SELECT
    r.id,
    r.title,
    r.url,
    r.description,
    r.resource_type,
    c.id as course_id,
    c.name as course_name,
    r.created_at
  FROM enrollments e
  JOIN courses c ON e.course_id = c.id
  JOIN resources r ON (
      r.course_id = c.id        -- Resource belongs to this enrolled course
      OR
      c.id = ANY(COALESCE(r.shared_course_ids, '{}'::uuid[]))  -- Resource is shared with this course
  )
  WHERE e.profile_id = v_user_id
  AND r.resource_type = 'Link'
  -- Respect enrollment expiry: expired = no access
  AND (e.expires_at IS NULL OR e.expires_at > now())

  UNION ALL

  -- Public Resources (Not tied to any specific course)
  SELECT
    r.id,
    r.title,
    r.url,
    r.description,
    r.resource_type,
    NULL::uuid as course_id,
    'Public Community'::text as course_name,
    r.created_at
  FROM resources r
  WHERE r.resource_type = 'Link'
  AND r.course_id IS NULL

  ORDER BY created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_student_community_links() TO authenticated;


-- ===== 20260426000002_fix_exam_access_rpc.sql =====
-- ====================================================================
-- Migration: Fix Readymade Exam Access & Recursive Linked Courses
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid()) 
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, question_index integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
BEGIN
  -- 1. Get Exam Metadata
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids, v_readymade_course_ids, v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  -- 2. Check Access Logic
  
  -- Case A: Public / Free Exam
  IF v_is_visible_on_free IS TRUE THEN
      v_has_access := true;
  END IF;

  -- Case B: Course-based Access (Direct, Linked Recursive, Shared, Readymade)
  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          -- Base case: Courses the user is directly enrolled in (and not expired)
          SELECT course_id 
          FROM public.enrollments 
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())
          
          UNION
          
          -- Recursive step: Follow linked_course_ids
          -- We use a recursive CTE to find all courses linked to the student's enrolled courses
          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE 
            -- Match primary course ID
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            -- Match shared course IDs
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            -- Match readymade course IDs
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
      ) INTO v_has_access;
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

-- Ensure permissions are set
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;


-- ===== 20260501000000_enhance_hero_carousel.sql =====
-- Add new columns to heroes table for advanced carousel items
ALTER TABLE public.heroes
ADD COLUMN IF NOT EXISTS hero_type TEXT DEFAULT 'image' CHECK (hero_type IN ('image', 'countdown', 'announcement')),
ADD COLUMN IF NOT EXISTS countdown_target TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS markdown_content TEXT,
ADD COLUMN IF NOT EXISTS background_config JSONB DEFAULT '{"type": "gradient", "from": "#064e3b", "to": "#022c22"}'::jsonb;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ===== 20260501000001_fix_hero_colors.sql =====
-- Update heroes table to use dark emerald as the default for new rows
ALTER TABLE public.heroes 
ALTER COLUMN background_config SET DEFAULT '{"type": "gradient", "from": "#064e3b", "to": "#022c22"}'::jsonb;

-- Update existing rows to the new dark emerald color
UPDATE public.heroes 
SET background_config = '{"type": "gradient", "from": "#064e3b", "to": "#022c22"}'::jsonb
WHERE background_config = '{"type": "gradient", "from": "#10b981", "to": "#059669"}'::jsonb 
   OR background_config IS NULL;


-- ===== 20260501000002_create_exam_schedules.sql =====
-- Create exam_schedules table
CREATE TABLE IF NOT EXISTS public.exam_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_name TEXT NOT NULL,
    paper_name TEXT, -- e.g., '1st Paper', '2nd Paper'
    exam_date TIMESTAMP WITH TIME ZONE NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on exam_schedules" 
    ON public.exam_schedules FOR SELECT USING (true);

-- Allow admin write access
CREATE POLICY "Allow admin all access on exam_schedules" 
    ON public.exam_schedules FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
      )
    );

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ===== 20260501000003_add_category_to_exam_schedules.sql =====
-- Add category_name to exam_schedules for grouping
ALTER TABLE public.exam_schedules
ADD COLUMN IF NOT EXISTS category_name TEXT DEFAULT 'এইচএসসি ২০২৬' NOT NULL;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ===== 20260720000000_fix_exam_review_question_scope.sql =====
-- Fix get_student_exam_review to only return questions that were part of the attempt
-- (relevant for readymade exams where the student picks a subset of MCQs).
-- Previously this returned ALL questions in exam_questions for the exam,
-- causing the review/result page to show the full question bank instead of
-- just the questions the student actually attempted.

CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id uuid)
RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
    v_answers JSONB;
BEGIN
    -- Get exam_id, profile_id and answers from attempt
    SELECT exam_id, profile_id, answers INTO v_exam_id, v_profile_id, v_answers
    FROM exam_attempts
    WHERE id = p_attempt_id;

    -- Check if the user is the owner of the attempt
    IF v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- If the attempt has a recorded answers list, scope the review to only
    -- those question ids (handles readymade exams with a subset of MCQs).
    -- If answers is null/empty (edge case), fall back to full exam question list.
    IF v_answers IS NOT NULL AND jsonb_typeof(v_answers) = 'array' AND jsonb_array_length(v_answers) > 0 THEN
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
        AND q.id IN (
            SELECT (x->>'question_id')::UUID
            FROM jsonb_array_elements(v_answers) AS x
        )
        ORDER BY q.question_index;
    ELSE
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
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ===== 20260720010000_quick_practice_schema.sql =====
-- Quick Practice feature: subjects, chapters, mcqs, user points, attempts, leaderboard

create table if not exists public.qp_subjects (
  id bigint generated always as identity primary key,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.qp_chapters (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.qp_subjects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.qp_mcqs (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.qp_chapters(id) on delete cascade,
  question text not null,
  options jsonb not null, -- ["opt1","opt2","opt3","opt4"]
  correct_index int not null,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.qp_user_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_points int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.qp_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null, -- 'random' | 'selected'
  chapter_ids bigint[],
  total_questions int not null default 0,
  correct_count int not null default 0,
  points_earned int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_qp_chapters_subject on public.qp_chapters(subject_id);
create index if not exists idx_qp_mcqs_chapter on public.qp_mcqs(chapter_id);
create index if not exists idx_qp_attempts_user on public.qp_attempts(user_id);

alter table public.qp_subjects enable row level security;
alter table public.qp_chapters enable row level security;
alter table public.qp_mcqs enable row level security;
alter table public.qp_user_points enable row level security;
alter table public.qp_attempts enable row level security;

-- Public read access for content tables (subjects/chapters/mcqs)
create policy "qp_subjects_select_all" on public.qp_subjects for select using (true);
create policy "qp_chapters_select_all" on public.qp_chapters for select using (true);
create policy "qp_mcqs_select_all" on public.qp_mcqs for select using (true);

-- Admin/teacher write access for content tables
create policy "qp_subjects_admin_write" on public.qp_subjects for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "qp_chapters_admin_write" on public.qp_chapters for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "qp_mcqs_admin_write" on public.qp_mcqs for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Points: user can read/update own row, leaderboard readable by everyone
create policy "qp_points_select_all" on public.qp_user_points for select using (true);
create policy "qp_points_upsert_own" on public.qp_user_points for insert with check (auth.uid() = user_id);
create policy "qp_points_update_own" on public.qp_user_points for update using (auth.uid() = user_id);

-- Attempts: user can insert/read own attempts only
create policy "qp_attempts_select_own" on public.qp_attempts for select using (auth.uid() = user_id);
create policy "qp_attempts_insert_own" on public.qp_attempts for insert with check (auth.uid() = user_id);

-- RPC: atomically add points to a user (creates row if missing)
create or replace function public.qp_add_points(p_user_id uuid, p_points int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.qp_user_points (user_id, total_points, updated_at)
  values (p_user_id, greatest(p_points, 0), now())
  on conflict (user_id) do update
    set total_points = public.qp_user_points.total_points + p_points,
        updated_at = now();
end;
$$;

grant execute on function public.qp_add_points(uuid, int) to authenticated;


-- ===== 20260720020000_focus_timer_schema.sql =====
-- Focus Timer feature: study/break/sleep session tracking + leaderboard

create table if not exists public.focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null check (mood in ('study','break','sleep')),
  duration_seconds int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_focus_sessions_user on public.focus_sessions(user_id);
create index if not exists idx_focus_sessions_created on public.focus_sessions(created_at);

alter table public.focus_sessions enable row level security;

create policy "focus_sessions_select_own" on public.focus_sessions for select using (auth.uid() = user_id);
create policy "focus_sessions_insert_own" on public.focus_sessions for insert with check (auth.uid() = user_id);
create policy "focus_sessions_update_own" on public.focus_sessions for update using (auth.uid() = user_id);

-- Leaderboard needs aggregate study time visible to everyone (not raw sessions).
-- Expose only what's needed via a security-definer function.
create or replace function public.focus_leaderboard(p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  select
    fs.user_id,
    p.full_name,
    p.hsc_batch,
    sum(fs.duration_seconds)::bigint as total_seconds
  from public.focus_sessions fs
  join public.profiles p on p.id = fs.user_id
  where fs.mood = 'study'
    and fs.created_at >= now() - (p_days || ' days')::interval
  group by fs.user_id, p.full_name, p.hsc_batch
  order by total_seconds desc
  limit 100;
$$;

grant execute on function public.focus_leaderboard(int) to authenticated, anon;


-- ===== 20260720030000_focus_timer_live_and_mood_leaderboard.sql =====
-- Focus Timer: live session tracking (resume across refresh, "studying now" list)
-- + per-mood (study/break/sleep) leaderboards.

alter table public.focus_sessions
  add column if not exists is_paused boolean not null default false,
  add column if not exists status text not null default 'ended'
    check (status in ('active', 'ended'));

create index if not exists idx_focus_sessions_status on public.focus_sessions(status);

-- Only one active/live segment per user at a time.
create unique index if not exists uq_focus_sessions_active_per_user
  on public.focus_sessions(user_id)
  where (status = 'active');

alter table public.focus_sessions enable row level security;

-- Anyone signed in can see who else has a live "active" segment right now
-- (for the "studying now" list); own historical rows already covered by
-- the existing select policy.
drop policy if exists "focus_sessions_select_active_public" on public.focus_sessions;
create policy "focus_sessions_select_active_public"
  on public.focus_sessions for select
  using (status = 'active');

-- start (or resume into) a live segment; returns the session id
create or replace function public.focus_start_session(p_mood text, p_resume_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_resume_id is not null then
    update public.focus_sessions
      set is_paused = false
      where id = p_resume_id and user_id = auth.uid() and status = 'active'
      returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- end any stray active segment for this user before starting a new one
  update public.focus_sessions
    set status = 'ended', ended_at = now()
    where user_id = auth.uid() and status = 'active';

  insert into public.focus_sessions (user_id, mood, duration_seconds, started_at, status, is_paused)
  values (auth.uid(), p_mood, 0, now(), 'active', false)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.focus_start_session(text, bigint) to authenticated;

-- periodic heartbeat while running (updates elapsed + pause flag on the live row)
create or replace function public.focus_update_session(p_id bigint, p_duration_seconds int, p_is_paused boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.focus_sessions
    set duration_seconds = p_duration_seconds, is_paused = p_is_paused
    where id = p_id and user_id = auth.uid() and status = 'active';
$$;

grant execute on function public.focus_update_session(bigint, int, boolean) to authenticated;

-- close out a live segment (mood switch or stop)
create or replace function public.focus_end_session(p_id bigint, p_duration_seconds int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.focus_sessions
    set status = 'ended', duration_seconds = p_duration_seconds, ended_at = now(), is_paused = false
    where id = p_id and user_id = auth.uid() and status = 'active';
$$;

grant execute on function public.focus_end_session(bigint, int) to authenticated;

-- "studying/on break/sleeping now" list: live active rows joined with profile info
create or replace function public.focus_live_now()
returns table(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at
  from public.focus_sessions fs
  join public.profiles p on p.id = fs.user_id
  where fs.status = 'active'
  order by fs.duration_seconds desc
  limit 200;
$$;

grant execute on function public.focus_live_now() to authenticated, anon;

-- Per-mood leaderboard (study/break/sleep), merging ended history with any
-- currently-active live segment so totals don't lag behind reality.
create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.mood = p_mood
      and fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id
  ),
  live as (
    select fs.user_id, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.mood = p_mood and fs.status = 'active'
  ),
  combined as (
    select user_id, secs from ended
    union all
    select user_id, secs from live
  ),
  totals as (
    select user_id, sum(secs)::bigint as total_seconds
    from combined
    group by user_id
  )
  select t.user_id, p.full_name, p.hsc_batch, t.total_seconds
  from totals t
  join public.profiles p on p.id = t.user_id
  order by t.total_seconds desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;

-- Keep the original study-only leaderboard working (now live-merged too),
-- since existing frontend code may still call it.
create or replace function public.focus_leaderboard(p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  select * from public.focus_mood_leaderboard('study', p_days);
$$;

grant execute on function public.focus_leaderboard(int) to authenticated, anon;


-- ===== 20260720040000_focus_history_rpc.sql =====
-- Study History page: user's own day-by-day focus session history.
-- Returns one row per calendar day (based on started_at), with mood totals summed,
-- so the client can render a day-wise history list + 7-day chart without pulling raw rows.

create or replace function public.focus_history_daily(p_days int default 30)
returns table(
  day date,
  study_seconds bigint,
  break_seconds bigint,
  sleep_seconds bigint,
  breaks_used bigint,
  session_count bigint,
  is_ongoing boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (fs.started_at at time zone 'Asia/Dhaka')::date as day,
    sum(case when fs.mood = 'study' then fs.duration_seconds else 0 end)::bigint as study_seconds,
    sum(case when fs.mood = 'break' then fs.duration_seconds else 0 end)::bigint as break_seconds,
    sum(case when fs.mood = 'sleep' then fs.duration_seconds else 0 end)::bigint as sleep_seconds,
    sum(case when fs.mood = 'break' then 1 else 0 end)::bigint as breaks_used,
    count(*)::bigint as session_count,
    bool_or(fs.ended_at is null) as is_ongoing
  from public.focus_sessions fs
  where fs.user_id = auth.uid()
    and (p_days <= 0 or fs.started_at >= now() - (p_days || ' days')::interval)
  group by day
  order by day desc
  limit 400;
$$;

grant execute on function public.focus_history_daily(int) to authenticated;


-- ===== 20260720040000_syllabus_tracker_schema.sql =====
-- Syllabus Tracker: simple content list managed from admin panel, shown on public page

create table if not exists public.syllabus_tracker_items (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  subject text,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.syllabus_tracker_items enable row level security;

create policy "syllabus_tracker_select_all" on public.syllabus_tracker_items
  for select using (true);

create policy "syllabus_tracker_admin_write" on public.syllabus_tracker_items for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));


-- ===== 20260720050000_focus_compare_daily_rpc.sql =====
-- Compare feature: day-wise Study totals for the caller + one other user, over N days.
-- Only Study-mode seconds are exposed (matches what the public leaderboard already reveals).

create or replace function public.focus_compare_daily(p_other_user uuid, p_days int)
returns table(user_id uuid, day date, total_seconds bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    fs.user_id,
    (fs.started_at at time zone 'Asia/Dhaka')::date as day,
    sum(fs.duration_seconds)::bigint as total_seconds
  from public.focus_sessions fs
  where fs.mood = 'study'
    and fs.user_id in (auth.uid(), p_other_user)
    and fs.started_at >= now() - (p_days || ' days')::interval
  group by fs.user_id, day
  order by day asc;
$$;

grant execute on function public.focus_compare_daily(uuid, int) to authenticated;


-- ===== 20260720050000_syllabus_tracker_full_system.sql =====
-- Syllabus Tracker full system (replaces the flat CMS list) — 100% parity with AtlasApp's
-- study-tracker.html: subjects -> chapters -> topics, per-mode (hsc/medical),
-- client-tracked per-topic completion (localStorage, same as Atlas) + aggregate
-- pct synced here for the leaderboard.

drop table if exists public.syllabus_tracker_items cascade;


create table if not exists public.st_subjects (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('hsc','medical')),
  name text not null,
  short_name text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.st_chapters (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.st_subjects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.st_topics (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.st_chapters(id) on delete cascade,
  name text not null,
  weight int not null default 1,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Aggregate per-user, per-mode progress (leaderboard). Per-topic done/undone
-- stays client-side (localStorage) exactly like AtlasApp; only the summary
-- pct is synced here.
create table if not exists public.st_user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('hsc','medical')),
  pct numeric not null default 0,
  done_topics int not null default 0,
  total_topics int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);

create index if not exists idx_st_chapters_subject on public.st_chapters(subject_id);
create index if not exists idx_st_topics_chapter on public.st_topics(chapter_id);
create index if not exists idx_st_subjects_mode on public.st_subjects(mode);

alter table public.st_subjects enable row level security;
alter table public.st_chapters enable row level security;
alter table public.st_topics enable row level security;
alter table public.st_user_progress enable row level security;

-- Public read for content tables
create policy "st_subjects_select_all" on public.st_subjects for select using (true);
create policy "st_chapters_select_all" on public.st_chapters for select using (true);
create policy "st_topics_select_all" on public.st_topics for select using (true);

-- Admin/teacher write for content tables
create policy "st_subjects_admin_write" on public.st_subjects for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "st_chapters_admin_write" on public.st_chapters for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "st_topics_admin_write" on public.st_topics for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Progress: leaderboard readable by everyone; user can only write their own row
create policy "st_progress_select_all" on public.st_user_progress for select using (true);
create policy "st_progress_upsert_own" on public.st_user_progress for insert with check (auth.uid() = user_id);
create policy "st_progress_update_own" on public.st_user_progress for update using (auth.uid() = user_id);

-- Upsert helper (mirrors AtlasApp's syncProgress POST with merge-duplicates)
create or replace function public.st_sync_progress(p_mode text, p_pct numeric, p_done int, p_total int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.st_user_progress (user_id, mode, pct, done_topics, total_topics, updated_at)
  values (auth.uid(), p_mode, p_pct, p_done, p_total, now())
  on conflict (user_id, mode) do update
    set pct = excluded.pct,
        done_topics = excluded.done_topics,
        total_topics = excluded.total_topics,
        updated_at = now();
end;
$$;

grant execute on function public.st_sync_progress(text, numeric, int, int) to authenticated;

-- Leaderboard: top progress per mode, joined with profile name/batch
create or replace function public.st_leaderboard(p_mode text)
returns table(user_id uuid, full_name text, hsc_batch text, pct numeric, done_topics int, total_topics int)
language sql
security definer
set search_path = public
as $$
  select sp.user_id, p.full_name, p.hsc_batch, sp.pct, sp.done_topics, sp.total_topics
  from public.st_user_progress sp
  join public.profiles p on p.id = sp.user_id
  where sp.mode = p_mode
  order by sp.pct desc
  limit 50;
$$;

grant execute on function public.st_leaderboard(text) to authenticated, anon;


-- ===== 20260720233048_leaderboard_view_add_avatar.sql =====
-- Add avatar_url to the leaderboard_exam_attempts view's embedded profile object,
-- so the Leaderboard page (podium + list) can show each student's uploaded profile photo.

drop view if exists public.leaderboard_exam_attempts;

create view public.leaderboard_exam_attempts as
 select a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object(
      'full_name', p.full_name,
      'registration_id', p.registration_id,
      'is_second_timer', p.is_second_timer,
      'avatar_url', p.avatar_url
    ) as profile,
    a.attempt_number,
    a.time_taken_seconds
   from (public.exam_attempts a
     join public.profiles p on ((p.id = a.profile_id)));

grant select on public.leaderboard_exam_attempts to authenticated, anon;


-- ===== 20260721000000_leaderboard_view_restore_fields.sql =====
-- The 20260720233048 migration (adding avatar_url) accidentally dropped
-- violation_count, hsc_batch, college_name, and school which were added
-- in an earlier migration. This restores all fields together.

DROP VIEW IF EXISTS public.leaderboard_exam_attempts;

CREATE VIEW public.leaderboard_exam_attempts AS
 SELECT a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object(
      'full_name', p.full_name,
      'registration_id', p.registration_id,
      'is_second_timer', p.is_second_timer,
      'hsc_batch', p.hsc_batch,
      'college_name', p.college_name,
      'school', p.school,
      'avatar_url', p.avatar_url
    ) AS profile,
    a.attempt_number,
    a.time_taken_seconds,
    a.violation_count
   FROM (public.exam_attempts a
     JOIN public.profiles p ON ((p.id = a.profile_id)));

GRANT SELECT ON public.leaderboard_exam_attempts TO authenticated, anon;


-- ===== 20260721060000_profile_avatar_upload.sql =====
-- Profile avatar upload: adds avatar_url column, a public storage bucket for avatars,
-- RLS policies so users can only manage their own avatar file, and updates
-- focus_live_now() to also return avatar_url so Focus Timer's live list can show it.

-- 1. Add avatar_url column to profiles (nullable, safe additive change)
alter table public.profiles
  add column if not exists avatar_url text;

-- 2. Create a public storage bucket for avatars (public read, so images can be displayed
--    directly via their public URL; writes are restricted by policies below)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3. Storage RLS policies: users can only upload/update/delete a file
--    named exactly with their own user id as the filename (e.g. "<user_id>.jpg"),
--    inside the "avatars" bucket. Anyone can read (bucket is public).
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Update focus_live_now() to also return avatar_url
-- (must drop first since the return type/columns are changing)
drop function if exists public.focus_live_now();

create or replace function public.focus_live_now()
returns table(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at, p.avatar_url
  from public.focus_sessions fs
  join public.profiles p on p.id = fs.user_id
  where fs.status = 'active'
  order by fs.duration_seconds desc
  limit 200;
$$;

grant execute on function public.focus_live_now() to authenticated, anon;


-- ===== 20260721070000_search_related_mcqs_rpc.sql =====
-- RPC: search_related_mcqs
-- Lets authenticated users search across ALL exam_questions (any exam) by keyword,
-- so the ATLAS AI chat can surface "related MCQ" results on demand.
-- Respects existing exam_questions RLS (authenticated-only) since it runs as invoker,
-- but is defined as a stable function for a simple ILIKE-based text search.

CREATE OR REPLACE FUNCTION public.search_related_mcqs(
  p_query text,
  p_exclude_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  exam_id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option character(1),
  explanation text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    eq.id,
    eq.exam_id,
    eq.question_text,
    eq.option_a,
    eq.option_b,
    eq.option_c,
    eq.option_d,
    eq.correct_option,
    eq.explanation
  FROM public.exam_questions eq
  WHERE
    (p_exclude_id IS NULL OR eq.id <> p_exclude_id)
    AND p_query IS NOT NULL
    AND length(trim(p_query)) > 1
    AND eq.question_text ILIKE ('%' || trim(p_query) || '%')
  ORDER BY eq.question_index ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.search_related_mcqs(text, uuid, int) TO authenticated;


-- ===== 20260721080000_ai_explanation_cache.sql =====
-- Cache AI-generated explanations permanently per question, so the same
-- question is never re-generated for different users or repeat views.
-- This is the key to making "ATLAS AI ব্যাখ্যা" load in 1-2 seconds:
-- the very first time anyone opens it for a question, it's generated and
-- saved here; every subsequent open (by anyone) is an instant DB read.

ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS ai_explanation text,
  ADD COLUMN IF NOT EXISTS ai_explanation_generated_at timestamptz;

-- Function: get cached explanation if present, otherwise return null so the
-- client knows it must generate-and-cache (see save_ai_explanation below).
CREATE OR REPLACE FUNCTION public.get_cached_ai_explanation(p_question_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ai_explanation FROM public.exam_questions WHERE id = p_question_id;
$$;

-- Function: save a freshly-generated explanation back to the cache.
-- Uses SECURITY DEFINER so any authenticated student can populate the
-- shared cache (not just admins), since this is a read-through cache,
-- not user-authored content.
CREATE OR REPLACE FUNCTION public.save_ai_explanation(p_question_id uuid, p_explanation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.exam_questions
  SET ai_explanation = p_explanation,
      ai_explanation_generated_at = now()
  WHERE id = p_question_id
    AND ai_explanation IS NULL; -- never overwrite an existing cached answer
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cached_ai_explanation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_explanation(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_exam_questions_ai_explanation_null
  ON public.exam_questions (id)
  WHERE ai_explanation IS NULL;

-- Also expose ai_explanation through get_student_exam_review so the client
-- gets the cache-check for free with the initial page load (no extra request).
CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id uuid)
RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer, ai_explanation text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
    v_answers JSONB;
BEGIN
    SELECT exam_id, profile_id, answers INTO v_exam_id, v_profile_id, v_answers
    FROM exam_attempts
    WHERE id = p_attempt_id;

    IF v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_answers IS NOT NULL AND jsonb_typeof(v_answers) = 'array' AND jsonb_array_length(v_answers) > 0 THEN
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
            q.question_index,
            q.ai_explanation
        FROM exam_questions q
        WHERE q.exam_id = v_exam_id
        AND q.id IN (
            SELECT (x->>'question_id')::UUID
            FROM jsonb_array_elements(v_answers) AS x
        )
        ORDER BY q.question_index;
    ELSE
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
            q.question_index,
            q.ai_explanation
        FROM exam_questions q
        WHERE q.exam_id = v_exam_id
        ORDER BY q.question_index;
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ===== 20260721100000_clear_poisoned_ai_cache.sql =====
-- Clear any AI explanations that were accidentally cached as a failure/busy
-- message (from before the client-side fix that skips caching failures).
-- These would otherwise be stuck forever showing "AI busy" instead of a
-- real explanation, since the cache write is "only if currently null".

UPDATE public.exam_questions
SET ai_explanation = NULL,
    ai_explanation_generated_at = NULL
WHERE ai_explanation IS NOT NULL
  AND (
    ai_explanation LIKE '❌%'
    OR ai_explanation LIKE '⏱️%'
  );


-- ===== 20260722000000_announcement_reads.sql =====
-- Track which users have seen which announcements
CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(announcement_id, user_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own reads"
    ON public.announcement_reads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reads"
    ON public.announcement_reads FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reads"
    ON public.announcement_reads FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id
    ON public.announcement_reads(announcement_id);


-- ===== 20260722010000_announcement_image_url.sql =====
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS image_url text;


-- ===== 20260722010000_focus_breaks_used_accuracy.sql =====
-- Fix breaks_used accuracy to match AtlasApp's client-side counter behavior:
-- AtlasApp increments breaksUsed exactly once per Study -> Break transition
-- (not once per DB row). Our old focus_history_daily counted every
-- mood='break' row as one break, which over-counts whenever a single break
-- stretch spans more than one row (e.g. app reload/resume mid-break).
--
-- Fix: store the actual break-transition flag on the row where the break
-- STARTED (is_break_start = true only on the first segment of a break
-- stretch), and sum that flag instead of counting all break rows.

alter table public.focus_sessions
  add column if not exists is_break_start boolean not null default false;

-- Re-create focus_start_session so it marks is_break_start correctly:
--   - resuming an existing active row (p_resume_id) never re-marks it
--   - starting a brand new 'break' row is marked as a break start
--   - starting 'study'/'sleep' rows is never marked
create or replace function public.focus_start_session(p_mood text, p_resume_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_resume_id is not null then
    update public.focus_sessions
      set is_paused = false
      where id = p_resume_id and user_id = auth.uid() and status = 'active'
      returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- end any stray active segment for this user before starting a new one
  update public.focus_sessions
    set status = 'ended', ended_at = now()
    where user_id = auth.uid() and status = 'active';

  insert into public.focus_sessions (user_id, mood, duration_seconds, started_at, status, is_paused, is_break_start)
  values (auth.uid(), p_mood, 0, now(), 'active', false, (p_mood = 'break'))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.focus_start_session(text, bigint) to authenticated;

-- focus_history_daily: sum is_break_start flags instead of counting all
-- break-mood rows, so multi-row break stretches (due to reload/resume)
-- count as exactly one break, matching AtlasApp.
create or replace function public.focus_history_daily(p_days int default 30)
returns table(
  day date,
  study_seconds bigint,
  break_seconds bigint,
  sleep_seconds bigint,
  breaks_used bigint,
  session_count bigint,
  is_ongoing boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (fs.started_at at time zone 'Asia/Dhaka')::date as day,
    sum(case when fs.mood = 'study' then fs.duration_seconds else 0 end)::bigint as study_seconds,
    sum(case when fs.mood = 'break' then fs.duration_seconds else 0 end)::bigint as break_seconds,
    sum(case when fs.mood = 'sleep' then fs.duration_seconds else 0 end)::bigint as sleep_seconds,
    sum(case when fs.is_break_start then 1 else 0 end)::bigint as breaks_used,
    count(*)::bigint as session_count,
    bool_or(fs.ended_at is null) as is_ongoing
  from public.focus_sessions fs
  where fs.user_id = auth.uid()
    and (p_days <= 0 or fs.started_at >= now() - (p_days || ' days')::interval)
  group by day
  order by day desc
  limit 400;
$$;

grant execute on function public.focus_history_daily(int) to authenticated;


-- ===== 20260722020000_focus_leaderboard_score_ranking.sql =====
-- Focus Timer: score-based leaderboard ranking, matching AtlasApp's Ultimate
-- Leaderboard formula exactly: rank order is decided by a penalty score
-- (more break/sleep time = lower rank), while the displayed number stays the
-- plain mode-specific total_seconds.
--   score = study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)
--
-- This only affects ranking ORDER; the displayed total_seconds for the
-- requested mood is unchanged, so break/sleep leaderboards still show their
-- own raw totals — they're just sorted using the same overall score so a
-- student who breaks/sleeps a lot doesn't rank falsely high.

create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id, fs.mood
  ),
  live as (
    select fs.user_id, fs.mood, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  combined as (
    select user_id, mood, secs from ended
    union all
    select user_id, mood, secs from live
  ),
  per_user_mood as (
    select user_id, mood, sum(secs)::bigint as secs
    from combined
    group by user_id, mood
  ),
  per_user as (
    select
      user_id,
      coalesce(sum(secs) filter (where mood = 'study'), 0)::bigint as study_seconds,
      coalesce(sum(secs) filter (where mood = 'break'), 0)::bigint as break_seconds,
      coalesce(sum(secs) filter (where mood = 'sleep'), 0)::bigint as sleep_seconds
    from per_user_mood
    group by user_id
  ),
  scored as (
    select
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) as score
    from per_user
    where study_seconds > 0 or break_seconds > 0 or sleep_seconds > 0
  )
  select
    s.user_id,
    p.full_name,
    p.hsc_batch,
    case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end as total_seconds
  from scored s
  join public.profiles p on p.id = s.user_id
  where case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end > 0
  order by s.score desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;


-- ===== 20260722030000_focus_breaks_today_rpc.sql =====
-- Focus Timer compare modal: today's break count for any user (self or peer),
-- matching AtlasApp's "বিরতি (আজ)" comparison row. Counts break-mood segments
-- started today (Asia/Dhaka), including one for the currently active live segment.
create or replace function public.focus_breaks_today(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint
  from public.focus_sessions fs
  where fs.user_id = p_user_id
    and fs.mood = 'break'
    and (fs.started_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date;
$$;

grant execute on function public.focus_breaks_today(uuid) to authenticated, anon;


-- ===== 20260722030000_focus_leaderboard_avatar_status.sql =====
-- Focus Leaderboard: add profile photo (avatar_url) and live status
-- (mood + is_paused, only when the user currently has an active session)
-- to focus_mood_leaderboard, matching AtlasApp's buildRankCard which shows
-- a real profile photo and a Live/Break/Sleep/Pause status pill per row.

create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(
  user_id uuid,
  full_name text,
  hsc_batch text,
  total_seconds bigint,
  avatar_url text,
  live_mood text,
  is_paused boolean
)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id, fs.mood
  ),
  live as (
    select fs.user_id, fs.mood, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  combined as (
    select user_id, mood, secs from ended
    union all
    select user_id, mood, secs from live
  ),
  per_user_mood as (
    select user_id, mood, sum(secs)::bigint as secs
    from combined
    group by user_id, mood
  ),
  per_user as (
    select
      user_id,
      coalesce(sum(secs) filter (where mood = 'study'), 0)::bigint as study_seconds,
      coalesce(sum(secs) filter (where mood = 'break'), 0)::bigint as break_seconds,
      coalesce(sum(secs) filter (where mood = 'sleep'), 0)::bigint as sleep_seconds
    from per_user_mood
    group by user_id
  ),
  scored as (
    select
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) as score
    from per_user
    where study_seconds > 0 or break_seconds > 0 or sleep_seconds > 0
  ),
  live_status as (
    select fs.user_id, fs.mood as live_mood, fs.is_paused
    from public.focus_sessions fs
    where fs.status = 'active'
  )
  select
    s.user_id,
    p.full_name,
    p.hsc_batch,
    case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end as total_seconds,
    p.avatar_url,
    ls.live_mood,
    coalesce(ls.is_paused, false) as is_paused
  from scored s
  join public.profiles p on p.id = s.user_id
  left join live_status ls on ls.user_id = s.user_id
  where case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end > 0
  order by s.score desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;


-- ===== 20260722040000_quick_practice_mode_rpc.sql =====
-- Quick Practice Mode: returns full MCQ data (incl. correct_option + explanation)
-- for a readymade exam so the client can render instant right/wrong feedback.
-- Restricted to is_readymade = true exams only (never leaks live/graded exam answers).

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  explanation text,
  question_index integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
BEGIN
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids, v_readymade_course_ids, v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF v_is_visible_on_free IS TRUE THEN
    v_has_access := true;
  END IF;

  IF NOT v_has_access AND v_exam_course_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments en
      WHERE en.profile_id = p_user_id
      AND en.course_id = v_exam_course_id
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.enrollments e
        JOIN public.courses c ON e.course_id = c.id
        WHERE e.profile_id = p_user_id
        AND c.linked_course_ids IS NOT NULL
        AND v_exam_course_id::text = ANY(COALESCE(c.linked_course_ids, '{}')::text[])
      ) INTO v_has_access;
    END IF;
  END IF;

  IF NOT v_has_access AND v_shared_course_ids IS NOT NULL AND array_length(v_shared_course_ids, 1) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments en_shared
      WHERE en_shared.profile_id = p_user_id
      AND en_shared.course_id = ANY(v_shared_course_ids)
    ) INTO v_has_access;
  END IF;

  -- Readymade exams can also be granted access via readymade_course_ids
  -- (a set of courses whose enrollees can access this readymade exam even
  -- though the exam itself has no direct course_id).
  IF NOT v_has_access AND v_readymade_course_ids IS NOT NULL AND array_length(v_readymade_course_ids, 1) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments en_rm
      WHERE en_rm.profile_id = p_user_id
      AND en_rm.course_id = ANY(v_readymade_course_ids)
    ) INTO v_has_access;
  END IF;

  IF v_has_access THEN
    RETURN QUERY
    SELECT
      q.id,
      q.question_text,
      q.option_a,
      q.option_b,
      q.option_c,
      q.option_d,
      q.correct_option::text,
      q.explanation,
      q.question_index
    FROM public.exam_questions q
    WHERE q.exam_id = p_exam_id
    ORDER BY q.question_index ASC;
  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;


-- ===== 20260722050000_add_free_exam_category.sql =====
-- Add category to exams for grouping Free Exam section by type
-- (HSC / Medical / Varsity / Onushilon), shown in admin add-form and
-- user-facing Free Exam page as a top-level filter.
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS free_exam_category TEXT DEFAULT 'HSC' NOT NULL;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ===== 20260722050000_quick_practice_topics.sql =====
-- Quick Practice: add optional Topic level between Chapter and MCQ
-- Structure: Subject > Chapter > Topic (optional) > MCQ

create table if not exists public.qp_topics (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.qp_chapters(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_qp_topics_chapter on public.qp_topics(chapter_id);

alter table public.qp_topics enable row level security;

create policy "qp_topics_select_all" on public.qp_topics for select using (true);

create policy "qp_topics_admin_write" on public.qp_topics for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Nullable topic_id on qp_mcqs so existing MCQs (no topic) keep working unchanged
alter table public.qp_mcqs
  add column if not exists topic_id bigint references public.qp_topics(id) on delete set null;

create index if not exists idx_qp_mcqs_topic on public.qp_mcqs(topic_id);


-- ===== 20260722060000_fix_quick_practice_mode_rpc_access.sql =====
-- Fix: get_exam_questions_practice was blocking valid users with an overly
-- strict enrollment/course check that doesn't match the actual access model.
-- Real RLS on exam_questions allows any authenticated user to view questions
-- of a published exam (or any exam_questions row at all, via the broader
-- "Authenticated users can view exam questions" policy). Quick Practice is
-- restricted to readymade exams only, so we align: any authenticated user
-- may fetch practice data for a readymade exam.

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  explanation text,
  question_index integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_is_readymade boolean;
BEGIN
  SELECT ex.is_readymade
  INTO v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.correct_option::text,
    q.explanation,
    q.question_index
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
  ORDER BY q.question_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;


-- ===== 20260722070000_quick_practice_bookmarks_and_detail.sql =====
-- Quick Practice: bookmarks + detail solve sheet support

alter table public.qp_attempts
  add column if not exists details jsonb;
-- details: array of { mcq_id, question, options, correct_index, selected_index, correct, chapter_name, subject_name }

create table if not exists public.qp_bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mcq_id bigint not null references public.qp_mcqs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, mcq_id)
);

create index if not exists idx_qp_bookmarks_user on public.qp_bookmarks(user_id);
create index if not exists idx_qp_bookmarks_mcq on public.qp_bookmarks(mcq_id);

alter table public.qp_bookmarks enable row level security;

create policy "qp_bookmarks_select_own" on public.qp_bookmarks for select using (auth.uid() = user_id);
create policy "qp_bookmarks_insert_own" on public.qp_bookmarks for insert with check (auth.uid() = user_id);
create policy "qp_bookmarks_delete_own" on public.qp_bookmarks for delete using (auth.uid() = user_id);


-- ===== 20260722080000_quick_practice_reports.sql =====
-- Quick Practice: report a mistake on an MCQ card

create table if not exists public.qp_question_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mcq_id bigint not null references public.qp_mcqs(id) on delete cascade,
  report_text text not null,
  suggested_correct_option text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'ignored')),
  created_at timestamptz not null default now()
);

create index if not exists idx_qp_reports_user on public.qp_question_reports(user_id);
create index if not exists idx_qp_reports_mcq on public.qp_question_reports(mcq_id);

alter table public.qp_question_reports enable row level security;

create policy "qp_reports_insert_own" on public.qp_question_reports for insert with check (auth.uid() = user_id);
create policy "qp_reports_select_own" on public.qp_question_reports for select using (auth.uid() = user_id);

create policy "qp_reports_select_admin" on public.qp_question_reports for select using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator'))
);
create policy "qp_reports_delete_admin" on public.qp_question_reports for delete using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator'))
);


-- ===== 20260723000000_seed_free_exam_categories.sql =====
-- Seed existing hardcoded Free Exam categories into global_metadata so admins
-- can rename/delete them and add new ones from the Exam form UI.
INSERT INTO public.global_metadata (type, value)
VALUES
  ('free_exam_category', 'HSC'),
  ('free_exam_category', 'Medical'),
  ('free_exam_category', 'Varsity'),
  ('free_exam_category', 'Onushilon')
ON CONFLICT (type, value) DO NOTHING;


-- ===== 20260723010000_guest_exam_attempts.sql =====
-- Guest / anonymous exam attempts for Free Exam.
-- A visitor who is NOT logged in can take a Free Exam by providing just:
--   name, HSC batch, college name, phone number
-- No auth.users account / signup is created. The attempt is stored with
-- profile_id = NULL and the 4 guest fields filled in instead.

-- 1. Allow profile_id to be NULL for guest attempts.
ALTER TABLE public.exam_attempts
  ALTER COLUMN profile_id DROP NOT NULL;

-- 2. Guest identity columns.
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_hsc_batch text,
  ADD COLUMN IF NOT EXISTS guest_college_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- 3. A guest attempt must always carry identity info; a logged-in attempt
--    must always carry a profile_id. Exactly one of the two paths.
ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_owner_check CHECK (
    (profile_id IS NOT NULL) OR
    (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
  );

-- 4. RLS: allow anonymous (anon) role to insert a guest attempt, but ONLY
--    for exams that are actually marked visible on the Free Exam page
--    (public.exams.is_visible_on_free = true). This prevents guests from
--    attempting paid/private exams by guessing an exam id.
CREATE POLICY "Guests can insert attempts on free exams"
  ON public.exam_attempts
  FOR INSERT
  TO anon
  WITH CHECK (
    profile_id IS NULL
    AND guest_name IS NOT NULL
    AND guest_phone IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_attempts.exam_id
        AND e.is_visible_on_free = true
    )
  );

-- 5. Guests also need to read the exam's questions to take it. Only for
--    exams visible on the Free Exam page.
CREATE POLICY "Guests can view questions of free exams"
  ON public.exam_questions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_questions.exam_id
        AND e.is_visible_on_free = true
    )
  );

-- 6. Guests need to read the exam row itself (title, duration, etc.) too.
CREATE POLICY "Guests can view free exams"
  ON public.exams
  FOR SELECT
  TO anon
  USING (is_visible_on_free = true);

-- 7. RLS: allow anonymous read of guest attempts on free exams only (needed
--    for the exam-review/result page right after a guest submits, and for
--    the Free Exam leaderboard). Guests are matched by phone number, which
--    the client keeps in sessionStorage for that browser session.
CREATE POLICY "Guests can view attempts on free exams"
  ON public.exam_attempts
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_attempts.exam_id
        AND e.is_visible_on_free = true
    )
  );


-- ===== 20260723020000_guest_submit_exam_attempt.sql =====
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


-- ===== 20260723030000_guest_exam_review_rpc.sql =====
-- get_student_exam_review: explicitly allow guest attempts (profile_id IS
-- NULL, i.e. Free Exam attempts taken without login) to be reviewed by
-- anyone holding the attempt id — same as how a guest already gets their
-- result link right after submitting. Logged-in-owner check is unchanged.

-- Postgres refuses CREATE OR REPLACE when the OUT-parameter row type
-- differs from an existing overload with the same signature in some
-- environments — drop first to guarantee a clean redefine.
DROP FUNCTION IF EXISTS public.get_student_exam_review(uuid);

CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id uuid)
RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
    v_answers JSONB;
BEGIN
    -- Get exam_id, profile_id and answers from attempt
    SELECT exam_id, profile_id, answers INTO v_exam_id, v_profile_id, v_answers
    FROM exam_attempts
    WHERE id = p_attempt_id;

    -- Ownership check: a logged-in attempt (profile_id set) must belong to
    -- the caller. A guest attempt (profile_id IS NULL, Free Exam without
    -- login) has no owner to check against — the attempt id itself (a UUID,
    -- effectively unguessable) is the access token, same as the public
    -- exam-review link a guest is handed right after submitting.
    IF v_profile_id IS NOT NULL AND v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- If the attempt has a recorded answers list, scope the review to only
    -- those question ids (handles readymade exams with a subset of MCQs).
    -- If answers is null/empty (edge case), fall back to full exam question list.
    IF v_answers IS NOT NULL AND jsonb_typeof(v_answers) = 'array' AND jsonb_array_length(v_answers) > 0 THEN
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
        AND q.id IN (
            SELECT (x->>'question_id')::UUID
            FROM jsonb_array_elements(v_answers) AS x
        )
        ORDER BY q.question_index;
    ELSE
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
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_exam_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_exam_review(uuid) TO anon;

NOTIFY pgrst, 'reload schema';


-- ===== 20260723040000_leaderboard_view_include_guests.sql =====
-- Include guest (login-free) Free Exam attempts in the per-exam leaderboard.
-- Previously this view INNER JOINed profiles, which silently excluded any
-- attempt with profile_id IS NULL (guest attempts). Switched to LEFT JOIN,
-- and the `profile` JSON now falls back to the attempt's own guest_* columns
-- when there is no profiles row (i.e. profile_id IS NULL).

DROP VIEW IF EXISTS public.leaderboard_exam_attempts;

CREATE VIEW public.leaderboard_exam_attempts AS
 SELECT a.id,
    a.exam_id,
    a.profile_id,
    a.score,
    a.started_at,
    a.submitted_at,
    a.attempt_type,
    a.created_at,
    jsonb_build_object(
      'full_name', COALESCE(p.full_name, a.guest_name),
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


-- ===== 20260723050000_fix_guest_attempts_privacy_leak.sql =====
-- The "Guests can view attempts on free exams" policy from
-- 20260723010000_guest_exam_attempts.sql exposed EVERY guest's name and
-- phone number (via exam_attempts SELECT) to any anonymous visitor, not
-- just the guest's own attempt. The exam-review page never needed this —
-- it already reads via the SECURITY DEFINER get_student_exam_review RPC,
-- keyed by attempt id (the link itself is the access token). Drop the
-- broad policy; no feature depended on direct table-level guest SELECT.

DROP POLICY IF EXISTS "Guests can view attempts on free exams" ON public.exam_attempts;


-- ===== 20260723050000_focus_leaderboard_premium_badge.sql =====
-- Add is_premium (PRO badge) to focus_mood_leaderboard: true only for students
-- with an active enrollment in a PAID course (course.price > 0), not just any
-- logged-in/free-registered user. Matches AtlasApp's PRO badge semantics.

create or replace function public.focus_mood_leaderboard(p_mood text, p_days int)
returns table(
  user_id uuid,
  full_name text,
  hsc_batch text,
  total_seconds bigint,
  avatar_url text,
  live_mood text,
  is_paused boolean,
  is_premium boolean
)
language sql
security definer
set search_path = public
as $$
  with ended as (
    select fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'ended'
      and fs.created_at >= now() - (p_days || ' days')::interval
    group by fs.user_id, fs.mood
  ),
  live as (
    select fs.user_id, fs.mood, fs.duration_seconds::bigint as secs
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  combined as (
    select user_id, mood, secs from ended
    union all
    select user_id, mood, secs from live
  ),
  per_user_mood as (
    select user_id, mood, sum(secs)::bigint as secs
    from combined
    group by user_id, mood
  ),
  per_user as (
    select
      user_id,
      coalesce(sum(secs) filter (where mood = 'study'), 0)::bigint as study_seconds,
      coalesce(sum(secs) filter (where mood = 'break'), 0)::bigint as break_seconds,
      coalesce(sum(secs) filter (where mood = 'sleep'), 0)::bigint as sleep_seconds
    from per_user_mood
    group by user_id
  ),
  scored as (
    select
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) as score
    from per_user
    where study_seconds > 0 or break_seconds > 0 or sleep_seconds > 0
  ),
  live_status as (
    select fs.user_id, fs.mood as live_mood, fs.is_paused
    from public.focus_sessions fs
    where fs.status = 'active'
  ),
  premium_users as (
    select distinct e.profile_id
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where c.price is not null and c.price > 0
      and (e.valid_until is null or e.valid_until > now())
  )
  select
    s.user_id,
    p.full_name,
    p.hsc_batch,
    case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end as total_seconds,
    p.avatar_url,
    ls.live_mood,
    coalesce(ls.is_paused, false) as is_paused,
    (pu.profile_id is not null) as is_premium
  from scored s
  join public.profiles p on p.id = s.user_id
  left join live_status ls on ls.user_id = s.user_id
  left join premium_users pu on pu.profile_id = s.user_id
  where case p_mood
      when 'study' then s.study_seconds
      when 'break' then s.break_seconds
      when 'sleep' then s.sleep_seconds
      else s.study_seconds
    end > 0
  order by s.score desc
  limit 100;
$$;

grant execute on function public.focus_mood_leaderboard(text, int) to authenticated, anon;


-- ===== 20260723060000_fix_submit_exam_attempt_overload_ambiguity.sql =====
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


-- ===== 20260723060000_mock_test_ecosystem.sql =====
-- Unlimited Mock Test ecosystem — fully separate from the main Exam system.
-- Content authored here (subject/chapter/topic, CSV, question bank) never
-- touches the `exams` / `exam_questions` tables. Existing readymade exams
-- can optionally be "linked" (referenced) into a mock test without merging data.

create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  chapter text,
  topic text,
  duration_minutes int not null default 30,
  total_marks numeric,
  negative_mark_per_question numeric not null default 0,
  instructions text,
  is_published boolean not null default false,
  is_archive boolean not null default false,
  -- optional: this mock test is just a pointer to an existing readymade exam
  linked_exam_id uuid references public.exams(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mock_exam_questions (
  id uuid primary key default gen_random_uuid(),
  mock_exam_id uuid not null references public.mock_exams(id) on delete cascade,
  question_index int not null default 1,
  question_text text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text not null default 'A',
  marks numeric not null default 1,
  explanation text,
  subject text,
  chapter text,
  topic text,
  created_at timestamptz not null default now()
);

create table if not exists public.mock_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  mock_exam_id uuid not null references public.mock_exams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  score numeric,
  total_marks numeric,
  answers jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists idx_mock_exam_questions_exam on public.mock_exam_questions(mock_exam_id);
create index if not exists idx_mock_exam_attempts_exam on public.mock_exam_attempts(mock_exam_id);
create index if not exists idx_mock_exam_attempts_user on public.mock_exam_attempts(user_id);
create index if not exists idx_mock_exams_published on public.mock_exams(is_published, is_archive);

alter table public.mock_exams enable row level security;
alter table public.mock_exam_questions enable row level security;
alter table public.mock_exam_attempts enable row level security;

-- Public/students can read published, non-archived mock tests + their questions
create policy "mock_exams_select_published" on public.mock_exams
  for select using (is_published = true and is_archive = false);

create policy "mock_exam_questions_select_for_published" on public.mock_exam_questions
  for select using (
    exists (select 1 from public.mock_exams e where e.id = mock_exam_id and e.is_published = true and e.is_archive = false)
  );

-- Admin/teacher full access
create policy "mock_exams_admin_all" on public.mock_exams
  for all using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "mock_exam_questions_admin_all" on public.mock_exam_questions
  for all using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "mock_exam_questions_admin_read_all" on public.mock_exam_questions
  for select using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Attempts: user manages their own; admin can read all
create policy "mock_exam_attempts_own_insert" on public.mock_exam_attempts
  for insert with check (auth.uid() = user_id);

create policy "mock_exam_attempts_own_select" on public.mock_exam_attempts
  for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

create policy "mock_exam_attempts_own_update" on public.mock_exam_attempts
  for update using (auth.uid() = user_id);


-- ===== 20260723070000_guest_attempt_review_rpc.sql =====
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


-- ===== 20260723080000_mock_test_setting.sql =====
-- "Unlimited Mock Test" tile visibility toggle, controlled from an admin
-- setting (reuses the existing app_settings key/value store + get_app_setting
-- RPC — no new table needed). Defaults to hidden until an admin turns it on.

INSERT INTO public.app_settings (key, value)
VALUES ('mock_test_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ===== 20260723090000_bypass_email_confirmation_on_admin_approval.sql =====
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


-- ===== 20260723100000_add_profile_gender.sql =====
-- Adds a gender field to profiles, collected at registration, so a
-- gender-appropriate avatar can be generated on the leaderboard (and
-- elsewhere) when the user hasn't uploaded a custom avatar_url.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IN ('male', 'female', 'other'));

COMMENT ON COLUMN public.profiles.gender IS
  'Collected at registration; used to pick a gender-appropriate default avatar when no custom avatar_url is set.';


-- ===== 20260723110000_handle_new_user_include_gender.sql =====
-- Add gender to handle_new_user so the value collected at registration
-- (passed via signUp's raw_user_meta_data) actually lands in profiles.gender.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    registration_id,
    full_name,
    father_name,
    mother_name,
    phone,
    hsc_batch,
    college_name,
    ssc_gpa,
    hsc_gpa,
    is_second_timer,
    gender,
    extra_time_multiplier
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, new.id::text),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'father_name',
    new.raw_user_meta_data->>'mother_name',
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'hsc_batch',
    new.raw_user_meta_data->>'college_name',
    COALESCE((new.raw_user_meta_data->>'ssc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'hsc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'is_second_timer')::boolean, false),
    new.raw_user_meta_data->>'gender',
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    father_name = EXCLUDED.father_name,
    mother_name = EXCLUDED.mother_name,
    phone = EXCLUDED.phone,
    hsc_batch = EXCLUDED.hsc_batch,
    college_name = EXCLUDED.college_name,
    ssc_gpa = EXCLUDED.ssc_gpa,
    hsc_gpa = EXCLUDED.hsc_gpa,
    is_second_timer = EXCLUDED.is_second_timer,
    gender = EXCLUDED.gender;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== 20260723120000_focus_close_stale_live_sessions.sql =====
-- Fix: a focus session could stay status='active' forever if the browser
-- was closed, crashed, or lost connection before focus_end_session ran —
-- showing that student as "Live" with a frozen/zero duration indefinitely.
--
-- Fix: track the last heartbeat time (heartbeat already fires every 5s from
-- the client via focus_update_session), and treat any 'active' session with
-- no heartbeat in the last 60 seconds as stale — auto-close it wherever
-- live/leaderboard data is read. This does NOT change which mood list a
-- student's completed time counts toward; it only stops a dead session from
-- showing as currently "Live".

ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Backfill: treat existing active rows as if they just heartbeated, so this
-- migration doesn't instantly mass-close genuinely live sessions.
UPDATE public.focus_sessions
  SET last_heartbeat_at = now()
  WHERE status = 'active' AND last_heartbeat_at IS NULL;

-- 1. Heartbeat now stamps last_heartbeat_at.
CREATE OR REPLACE FUNCTION public.focus_update_session(p_id bigint, p_duration_seconds int, p_is_paused boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.focus_sessions
    SET duration_seconds = p_duration_seconds, is_paused = p_is_paused, last_heartbeat_at = now()
    WHERE id = p_id AND user_id = auth.uid() AND status = 'active';
$$;

-- 2. Small helper: auto-close any 'active' session that hasn't heartbeated
--    in over 60 seconds (dead tab/browser closed/crash). Safe to call often;
--    called at the top of focus_live_now() and focus_start_session() so
--    stale sessions never linger and never block a fresh session start.
CREATE OR REPLACE FUNCTION public.focus_close_stale_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.focus_sessions
    SET status = 'ended', ended_at = now(), is_paused = false
    WHERE status = 'active'
      AND COALESCE(last_heartbeat_at, started_at) < now() - interval '60 seconds';
$$;

GRANT EXECUTE ON FUNCTION public.focus_close_stale_sessions() TO authenticated, anon;

-- 3. focus_live_now: close stale sessions first, then read — so a dead
--    session never shows up as "Live" with a frozen/zero time.
DROP FUNCTION IF EXISTS public.focus_live_now();

CREATE OR REPLACE FUNCTION public.focus_live_now()
RETURNS TABLE(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  SELECT fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at, p.avatar_url
  FROM public.focus_sessions fs
  JOIN public.profiles p ON p.id = fs.user_id
  WHERE fs.status = 'active'
  ORDER BY fs.duration_seconds DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_live_now() TO authenticated, anon;

-- 5. focus_mood_leaderboard also UNIONs live 'active' sessions into the
--    ranking (see 20260722020000_focus_leaderboard_score_ranking.sql) — a
--    stale session there would similarly inflate/freeze a student's ranked
--    time. Wrap it to sweep stale sessions first, keeping the exact same
--    ranking logic/signature as before.
DROP FUNCTION IF EXISTS public.focus_mood_leaderboard(text, int);

CREATE OR REPLACE FUNCTION public.focus_mood_leaderboard(p_mood text, p_days int)
RETURNS TABLE(user_id uuid, full_name text, hsc_batch text, total_seconds bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.focus_close_stale_sessions();

  RETURN QUERY
  WITH ended AS (
    SELECT fs.user_id, fs.mood, sum(fs.duration_seconds)::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'ended'
      AND fs.created_at >= now() - (p_days || ' days')::interval
    GROUP BY fs.user_id, fs.mood
  ),
  live AS (
    SELECT fs.user_id, fs.mood, fs.duration_seconds::bigint AS secs
    FROM public.focus_sessions fs
    WHERE fs.status = 'active'
  ),
  combined AS (
    SELECT user_id, mood, secs FROM ended
    UNION ALL
    SELECT user_id, mood, secs FROM live
  ),
  per_user_mood AS (
    SELECT user_id, mood, sum(secs)::bigint AS secs
    FROM combined
    GROUP BY user_id, mood
  ),
  per_user AS (
    SELECT
      user_id,
      COALESCE(sum(secs) FILTER (WHERE mood = 'study'), 0)::bigint AS study_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'break'), 0)::bigint AS break_seconds,
      COALESCE(sum(secs) FILTER (WHERE mood = 'sleep'), 0)::bigint AS sleep_seconds
    FROM per_user_mood
    GROUP BY user_id
  ),
  scored AS (
    SELECT
      user_id,
      study_seconds,
      break_seconds,
      sleep_seconds,
      (study_seconds - (break_seconds * 0.3) - (sleep_seconds * 0.15)) AS score
    FROM per_user
    WHERE study_seconds > 0 OR break_seconds > 0 OR sleep_seconds > 0
  )
  SELECT
    s.user_id,
    p.full_name,
    p.hsc_batch,
    CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END AS total_seconds
  FROM scored s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE CASE p_mood
      WHEN 'study' THEN s.study_seconds
      WHEN 'break' THEN s.break_seconds
      WHEN 'sleep' THEN s.sleep_seconds
      ELSE s.study_seconds
    END > 0
  ORDER BY s.score DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.focus_mood_leaderboard(text, int) TO authenticated, anon;


-- ===== 20260724000000_mock_question_pool.sql =====
-- AtlasApp-style Unlimited Mock Test: student picks subject/chapter/topic/standard/count
-- and gets a randomly generated test from a shared question pool (no fixed "exam" entity).

create table if not exists public.mock_question_pool (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  paper text,
  chapter text not null,
  topic text,
  standard text not null default 'medical', -- medical | varsity | onushiloni
  question_count int not null default 0,
  questions_json jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mock_pool_subject_chapter on public.mock_question_pool(subject, chapter);
create index if not exists idx_mock_pool_standard on public.mock_question_pool(standard);

alter table public.mock_question_pool enable row level security;

create policy "mock_pool_select_all" on public.mock_question_pool
  for select using (true);

create policy "mock_pool_admin_all" on public.mock_question_pool
  for all using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));

-- Attempts from the pool-based (dynamic) mock test have no fixed mock_exam_id.
alter table public.mock_exam_attempts alter column mock_exam_id drop not null;


-- ===== 20260724010000_add_option_e_support.sql =====
-- Add support for a 5th MCQ option (option_e)
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS option_e text;

ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_correct_option_check;

ALTER TABLE public.exam_questions
  ADD CONSTRAINT exam_questions_correct_option_check
  CHECK (correct_option = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar, 'E'::bpchar]));


-- ===== 20260724010000_mock_bookmarks.sql =====
-- Bookmarks for Unlimited Mock Test questions. Since pool questions are dynamic
-- (randomly generated from JSON, not fixed rows), we store a snapshot per bookmark.

create table if not exists public.mock_question_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null, -- stable hash/id of the question text, used to dedupe
  exam_name text,
  subject text,
  chapter text,
  question_text text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  explanation text,
  created_at timestamptz not null default now(),
  unique (user_id, question_key)
);

create index if not exists idx_mock_bookmarks_user on public.mock_question_bookmarks(user_id);

alter table public.mock_question_bookmarks enable row level security;

create policy "mock_bookmarks_own_select" on public.mock_question_bookmarks
  for select using (auth.uid() = user_id);

create policy "mock_bookmarks_own_insert" on public.mock_question_bookmarks
  for insert with check (auth.uid() = user_id);

create policy "mock_bookmarks_own_delete" on public.mock_question_bookmarks
  for delete using (auth.uid() = user_id);


-- ===== 20260724020000_add_option_e_to_rpcs.sql =====
-- Add option_e to exam question RPC return types (5-option MCQ support)

DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text, question_index integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
BEGIN
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids, v_readymade_course_ids, v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_visible_on_free IS TRUE THEN
      v_has_access := true;
  END IF;

  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
      ) INTO v_has_access;
  END IF;

  IF v_has_access THEN
      RETURN QUERY
      SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.option_e,
        q.question_index
      FROM public.exam_questions q
      WHERE q.exam_id = p_exam_id
      ORDER BY q.question_index ASC;
  ELSE
      RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;


DROP FUNCTION IF EXISTS public.get_exam_questions_practice(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  option_e text,
  correct_option text,
  explanation text,
  question_index integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_is_readymade boolean;
BEGIN
  SELECT ex.is_readymade
  INTO v_is_readymade
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.option_e,
    q.correct_option::text,
    q.explanation,
    q.question_index
  FROM public.exam_questions q
  WHERE q.exam_id = p_exam_id
  ORDER BY q.question_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;


-- ===== 20260724020000_drop_curated_mock_exams_system.sql =====
-- The curated "Unlimited Mock Test" list (mock_exams / mock_exam_questions)
-- has been removed from the app in favor of the AtlasApp-style flow:
-- subject → chapter → topic → random questions from mock_question_pool.
-- These 2 tables are no longer referenced anywhere in the codebase.

DROP TABLE IF EXISTS public.mock_exam_questions CASCADE;
DROP TABLE IF EXISTS public.mock_exams CASCADE;

-- mock_exam_attempts is still used by PlayUnlimitedMock.tsx as a best-effort
-- attempt-history log, so it's kept — but its mock_exam_id FK pointed at the
-- now-dropped mock_exams table (and was NOT NULL, so every insert from the
-- pool-based flow was silently failing already). Make it nullable and drop
-- the dangling FK so pool-based attempts (which have no mock_exam_id) can
-- actually be recorded.
ALTER TABLE public.mock_exam_attempts
  ALTER COLUMN mock_exam_id DROP NOT NULL;

ALTER TABLE public.mock_exam_attempts
  DROP CONSTRAINT IF EXISTS mock_exam_attempts_mock_exam_id_fkey;



-- ===== 20260724020000_mock_bookmarks_option_e.sql =====
-- Add option_e to mock_question_bookmarks for 5-option MCQ support
alter table public.mock_question_bookmarks add column if not exists option_e text;


-- ===== 20260724030000_bypass_email_confirmation_on_enrollment_insert.sql =====
-- Manual admin enrollment (Registration ID -> enrollments direct insert, see
-- AdminStudents.tsx EnrollStudentForm) did not auto-confirm the student's
-- email the way payment_request approval does. This adds a trigger on
-- enrollments so ANY new enrollment row (manual or via payment approval)
-- auto-confirms the student's email, closing that gap.

CREATE OR REPLACE FUNCTION public.handle_enrollment_insert_confirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = NEW.profile_id AND email_confirmed_at IS NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_insert_confirm_email ON public.enrollments;

CREATE TRIGGER trg_enrollment_insert_confirm_email
    AFTER INSERT ON public.enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_enrollment_insert_confirm_email();


-- ===== 20260727000000_recalc_attempt_scores_on_question_edit.sql =====
-- When admin edits a question's correct answer (e.g. via a resolved report),
-- existing exam_attempts for that exam were scored against the OLD answer key.
-- This function recalculates score/total_marks for every attempt on the exam
-- that owns the edited question, using the same formula as submit_exam_attempt.

CREATE OR REPLACE FUNCTION public.recalculate_exam_attempts_for_exam(p_exam_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_negative_mark NUMERIC;
    v_attempt RECORD;
    v_answer RECORD;
    v_correct_option TEXT;
    v_question_marks NUMERIC;
    v_raw_score NUMERIC;
    v_deduction NUMERIC;
    v_is_second_timer BOOLEAN;
    v_question_count INTEGER;
    v_updated_count INTEGER := 0;
BEGIN
    SELECT COALESCE(negative_mark_per_question, 0) INTO v_negative_mark
    FROM public.exams
    WHERE id = p_exam_id;

    SELECT count(*) INTO v_question_count
    FROM public.exam_questions
    WHERE exam_id = p_exam_id;

    FOR v_attempt IN
        SELECT id, profile_id, answers
        FROM public.exam_attempts
        WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;

        FOR v_answer IN
            SELECT * FROM jsonb_to_recordset(v_attempt.answers) AS x(question_id UUID, selected_option TEXT)
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

        v_deduction := 0;
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer THEN
            IF v_question_count >= 100 THEN
                v_deduction := 3;
            ELSIF v_question_count >= 50 THEN
                v_deduction := 1.5;
            ELSIF v_question_count >= 30 THEN
                v_deduction := 1;
            END IF;
        END IF;

        UPDATE public.exam_attempts
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN v_updated_count;
END;
$$;

-- Convenience wrapper: recalculate by question_id (finds the owning exam first).
CREATE OR REPLACE FUNCTION public.recalculate_exam_attempts_for_question(p_question_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exam_id UUID;
BEGIN
    SELECT exam_id INTO v_exam_id FROM public.exam_questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    RETURN public.recalculate_exam_attempts_for_exam(v_exam_id);
END;
$$;


-- ===== 20260727010000_mock_exam_attempts_history_fields.sql =====
-- Unlimited Mock Test attempts currently store no subject/chapter/questions,
-- and mock_exam_id is NOT NULL even though the unlimited-pool flow inserts
-- mock_exam_id: null (PlayUnlimitedMock.tsx). This has silently made every
-- unlimited mock attempt insert fail. Add the fields needed for a subject-wise
-- History page (subject, chapter, topic, question count, date/time, and a
-- questions+answers snapshot so "Result Sheet" can replay the result view),
-- and relax the FK to allow unlimited-pool attempts.

alter table public.mock_exam_attempts
  alter column mock_exam_id drop not null;

alter table public.mock_exam_attempts
  add column if not exists subject text,
  add column if not exists chapter text,
  add column if not exists topic text,
  add column if not exists title text,
  add column if not exists session_id text,
  add column if not exists total_questions int,
  add column if not exists questions_snapshot jsonb;

create index if not exists idx_mock_exam_attempts_user_submitted
  on public.mock_exam_attempts(user_id, submitted_at desc);


-- ===== 20260728000000_add_split_exam_support.sql =====
-- Split Exam feature: admin can split a readymade exam's MCQs into several
-- smaller "virtual" exams (e.g. 1-5, 6-10...) WITHOUT copying any
-- exam_questions rows. A split-child is a normal row in public.exams (so
-- every existing exam flow — TakeExam, review, PDF export — works
-- unmodified) but flagged with parent_exam_id + a question_index range.
-- Its own exam_questions table stays empty; RPCs below resolve the parent
-- and slice by question_index instead.

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS parent_exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS split_start integer;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS split_end integer;

CREATE INDEX IF NOT EXISTS idx_exams_parent_exam_id ON public.exams(parent_exam_id) WHERE parent_exam_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- get_exam_questions_start: same access-check logic as before, but if the
-- exam is a split-child, resolve to the parent's questions sliced by
-- question_index BETWEEN split_start AND split_end.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text, question_index integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
  v_parent_exam_id uuid;
  v_split_start integer;
  v_split_end integer;
  v_source_exam_id uuid;
BEGIN
  SELECT ex.course_id, ex.is_visible_on_free, ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade,
         ex.parent_exam_id, ex.split_start, ex.split_end
  INTO v_exam_course_id, v_is_visible_on_free, v_shared_course_ids, v_readymade_course_ids, v_is_readymade,
       v_parent_exam_id, v_split_start, v_split_end
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  v_source_exam_id := COALESCE(v_parent_exam_id, p_exam_id);

  IF v_is_visible_on_free IS TRUE THEN
      v_has_access := true;
  END IF;

  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
      ) INTO v_has_access;
  END IF;

  IF v_has_access THEN
      RETURN QUERY
      SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.option_e,
        q.question_index
      FROM public.exam_questions q
      WHERE q.exam_id = v_source_exam_id
        AND (v_parent_exam_id IS NULL OR q.question_index BETWEEN v_split_start AND v_split_end)
      ORDER BY q.question_index ASC;
  ELSE
      RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- get_exam_questions_practice: same split-aware slicing.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_exam_questions_practice(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_practice(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  option_e text,
  correct_option text,
  explanation text,
  question_index integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_is_readymade boolean;
  v_parent_exam_id uuid;
  v_split_start integer;
  v_split_end integer;
  v_source_exam_id uuid;
BEGIN
  SELECT ex.is_readymade, ex.parent_exam_id, ex.split_start, ex.split_end
  INTO v_is_readymade, v_parent_exam_id, v_split_start, v_split_end
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  IF v_is_readymade IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_source_exam_id := COALESCE(v_parent_exam_id, p_exam_id);

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.option_e,
    q.correct_option::text,
    q.explanation,
    q.question_index
  FROM public.exam_questions q
  WHERE q.exam_id = v_source_exam_id
    AND (v_parent_exam_id IS NULL OR q.question_index BETWEEN v_split_start AND v_split_end)
  ORDER BY q.question_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_practice(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- get_student_exam_review: resolve split-child's parent before scoping
-- the question lookup, otherwise q.exam_id = v_exam_id would return
-- nothing for split attempts (their questions live under the parent).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_student_exam_review(uuid);

CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id uuid)
RETURNS TABLE(question_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, correct_option text, marks numeric, explanation text, question_index integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exam_id UUID;
    v_profile_id UUID;
    v_answers JSONB;
    v_parent_exam_id UUID;
    v_source_exam_id UUID;
BEGIN
    SELECT exam_id, profile_id, answers INTO v_exam_id, v_profile_id, v_answers
    FROM exam_attempts
    WHERE id = p_attempt_id;

    IF v_profile_id IS NOT NULL AND v_profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT parent_exam_id INTO v_parent_exam_id FROM public.exams WHERE id = v_exam_id;
    v_source_exam_id := COALESCE(v_parent_exam_id, v_exam_id);

    IF v_answers IS NOT NULL AND jsonb_typeof(v_answers) = 'array' AND jsonb_array_length(v_answers) > 0 THEN
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
        WHERE q.exam_id = v_source_exam_id
        AND q.id IN (
            SELECT (x->>'question_id')::UUID
            FROM jsonb_array_elements(v_answers) AS x
        )
        ORDER BY q.question_index;
    ELSE
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
        WHERE q.exam_id = v_source_exam_id
        ORDER BY q.question_index;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_exam_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_exam_review(uuid) TO anon;

-- ---------------------------------------------------------------------
-- create_split_exams: admin-only RPC. Given a parent readymade exam id
-- and a per-split MCQ count, creates N new rows in public.exams (the
-- split children), copying all display/access metadata from the parent
-- but WITHOUT touching exam_questions at all. Returns the created rows.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_split_exams(p_parent_exam_id uuid, p_per_split_count integer)
RETURNS TABLE(id uuid, title text, split_start integer, split_end integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_parent RECORD;
  v_total_questions INTEGER;
  v_start INTEGER;
  v_end INTEGER;
  v_new_id UUID;
  v_new_title TEXT;
BEGIN
  IF p_per_split_count IS NULL OR p_per_split_count < 1 THEN
    RAISE EXCEPTION 'Invalid split count';
  END IF;

  SELECT * INTO v_parent FROM public.exams WHERE id = p_parent_exam_id AND parent_exam_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent exam not found or is itself a split exam';
  END IF;

  SELECT count(*) INTO v_total_questions FROM public.exam_questions WHERE exam_id = p_parent_exam_id;
  IF v_total_questions < 1 THEN
    RAISE EXCEPTION 'Parent exam has no questions';
  END IF;

  -- Remove any previous splits of this parent before regenerating.
  DELETE FROM public.exams WHERE parent_exam_id = p_parent_exam_id;

  v_start := 1;
  WHILE v_start <= v_total_questions LOOP
    v_end := LEAST(v_start + p_per_split_count - 1, v_total_questions);
    v_new_title := v_parent.title || ' (' || v_start || '-' || v_end || ')';

    INSERT INTO public.exams (
      course_id, title, exam_type, duration_minutes, negative_mark_per_question,
      total_marks, instructions, is_published, subject, restrict_solution, chapter,
      shared_course_ids, is_visible_on_free, category, is_readymade,
      readymade_course_ids, readymade_topic, readymade_category, readymade_sub_chapter,
      parent_exam_id, split_start, split_end
    ) VALUES (
      v_parent.course_id, v_new_title, v_parent.exam_type, GREATEST(1, CEIL((v_end - v_start + 1) * 30 / 60.0))::integer,
      v_parent.negative_mark_per_question, (v_end - v_start + 1), v_parent.instructions,
      v_parent.is_published, v_parent.subject, v_parent.restrict_solution, v_parent.chapter,
      v_parent.shared_course_ids, v_parent.is_visible_on_free, v_parent.category, true,
      v_parent.readymade_course_ids, v_parent.readymade_topic, v_parent.readymade_category, v_parent.readymade_sub_chapter,
      p_parent_exam_id, v_start, v_end
    )
    RETURNING exams.id INTO v_new_id;

    id := v_new_id;
    title := v_new_title;
    split_start := v_start;
    split_end := v_end;
    RETURN NEXT;

    v_start := v_end + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_split_exams(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20260728000000_class_views.sql =====
-- Tracks how many (distinct) students have viewed a class, for the "X জন দেখেছে"
-- stat shown on the class player page header.

CREATE TABLE IF NOT EXISTS public.class_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL,
    first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    view_count INTEGER DEFAULT 1 NOT NULL,
    UNIQUE (class_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_class_views_class_id ON public.class_views(class_id);

ALTER TABLE public.class_views ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can record/update their own view.
CREATE POLICY "Users can upsert their own class view"
    ON public.class_views
    FOR INSERT
    TO authenticated
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update their own class view"
    ON public.class_views
    FOR UPDATE
    TO authenticated
    USING (profile_id = auth.uid());

-- Everyone (including anon, for public course preview pages) can read aggregate counts.
CREATE POLICY "Anyone can read class views"
    ON public.class_views
    FOR SELECT
    USING (true);

-- Upsert helper: call this when a student opens a class player.
CREATE OR REPLACE FUNCTION public.record_class_view(p_class_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.class_views (class_id, profile_id, first_viewed_at, last_viewed_at, view_count)
    VALUES (p_class_id, auth.uid(), now(), now(), 1)
    ON CONFLICT (class_id, profile_id)
    DO UPDATE SET last_viewed_at = now(), view_count = public.class_views.view_count + 1;
END;
$$;


-- ===== 20260728000001_add_admin_search_by_email.sql =====
-- Admin RPC to find profile ids whose auth email matches a search term
CREATE OR REPLACE FUNCTION public.admin_search_users_by_email(p_search text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT u.id FROM auth.users u
  WHERE u.email ILIKE '%' || p_search || '%';
END;
$$;


-- ===== 20260728000002_add_identifier_exists_check.sql =====
-- Public RPC (rate-limited by Turnstile captcha on the login form) to check
-- whether a login identifier (registration_id, phone, or email) exists.
-- Used only to give a clearer error message ("account not found" vs
-- "wrong password") — it never reveals which field matched or any other data.
CREATE OR REPLACE FUNCTION public.check_identifier_exists(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.registration_id = p_identifier
       OR p.phone = p_identifier
  ) OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.email = p_identifier
       OR u.email = p_identifier || '@beshijoss.com'
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_identifier_exists(text) TO anon, authenticated;


-- ===== 20260728000003_add_resolve_login_email.sql =====
-- Public RPC (rate-limited by Turnstile captcha on the login form) to resolve
-- a phone number or registration_id to the account's real auth email.
-- This is required because registration now creates auth users with the
-- student's real email, not a synthetic one, so phone-based login must look
-- up the actual email before calling signInWithPassword.
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE phone = p_identifier OR registration_id = p_identifier
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;


-- ===== 20260728010000_fix_split_exam_ambiguous_id.sql =====
-- Fix: create_split_exams RPC's OUT parameter "id" collided with the
-- "id" column reference in "SELECT * INTO v_parent FROM public.exams
-- WHERE id = p_parent_exam_id", causing "column reference id is
-- ambiguous". Qualify the column with the table alias.

DROP FUNCTION IF EXISTS public.create_split_exams(uuid, integer);

CREATE OR REPLACE FUNCTION public.create_split_exams(p_parent_exam_id uuid, p_per_split_count integer)
RETURNS TABLE(id uuid, title text, split_start integer, split_end integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_parent RECORD;
  v_total_questions INTEGER;
  v_start INTEGER;
  v_end INTEGER;
  v_new_id UUID;
  v_new_title TEXT;
BEGIN
  IF p_per_split_count IS NULL OR p_per_split_count < 1 THEN
    RAISE EXCEPTION 'Invalid split count';
  END IF;

  SELECT ex.* INTO v_parent FROM public.exams ex WHERE ex.id = p_parent_exam_id AND ex.parent_exam_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent exam not found or is itself a split exam';
  END IF;

  SELECT count(*) INTO v_total_questions FROM public.exam_questions eq WHERE eq.exam_id = p_parent_exam_id;
  IF v_total_questions < 1 THEN
    RAISE EXCEPTION 'Parent exam has no questions';
  END IF;

  -- Remove any previous splits of this parent before regenerating.
  DELETE FROM public.exams ex WHERE ex.parent_exam_id = p_parent_exam_id;

  v_start := 1;
  WHILE v_start <= v_total_questions LOOP
    v_end := LEAST(v_start + p_per_split_count - 1, v_total_questions);
    v_new_title := v_parent.title || ' (' || v_start || '-' || v_end || ')';

    INSERT INTO public.exams (
      course_id, title, exam_type, duration_minutes, negative_mark_per_question,
      total_marks, instructions, is_published, subject, restrict_solution, chapter,
      shared_course_ids, is_visible_on_free, category, is_readymade,
      readymade_course_ids, readymade_topic, readymade_category, readymade_sub_chapter,
      parent_exam_id, split_start, split_end
    ) VALUES (
      v_parent.course_id, v_new_title, v_parent.exam_type, GREATEST(1, CEIL((v_end - v_start + 1) * 30 / 60.0))::integer,
      v_parent.negative_mark_per_question, (v_end - v_start + 1), v_parent.instructions,
      v_parent.is_published, v_parent.subject, v_parent.restrict_solution, v_parent.chapter,
      v_parent.shared_course_ids, v_parent.is_visible_on_free, v_parent.category, true,
      v_parent.readymade_course_ids, v_parent.readymade_topic, v_parent.readymade_category, v_parent.readymade_sub_chapter,
      p_parent_exam_id, v_start, v_end
    )
    RETURNING exams.id INTO v_new_id;

    id := v_new_id;
    title := v_new_title;
    split_start := v_start;
    split_end := v_end;
    RETURN NEXT;

    v_start := v_end + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_split_exams(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20260728020000_fix_split_exam_missing_questions.sql =====
-- Fix: create_split_exams created new exam rows with correct split_start/
-- split_end/total_marks, but never copied any rows into exam_questions for
-- them. Students opening a split exam therefore saw zero MCQs. This copies
-- the corresponding question slice (ordered by question_index) into
-- exam_questions for each new split exam, re-indexed from 1.

DROP FUNCTION IF EXISTS public.create_split_exams(uuid, integer);

CREATE OR REPLACE FUNCTION public.create_split_exams(p_parent_exam_id uuid, p_per_split_count integer)
RETURNS TABLE(id uuid, title text, split_start integer, split_end integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_parent RECORD;
  v_total_questions INTEGER;
  v_start INTEGER;
  v_end INTEGER;
  v_new_id UUID;
  v_new_title TEXT;
BEGIN
  IF p_per_split_count IS NULL OR p_per_split_count < 1 THEN
    RAISE EXCEPTION 'Invalid split count';
  END IF;

  SELECT ex.* INTO v_parent FROM public.exams ex WHERE ex.id = p_parent_exam_id AND ex.parent_exam_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent exam not found or is itself a split exam';
  END IF;

  SELECT count(*) INTO v_total_questions FROM public.exam_questions eq WHERE eq.exam_id = p_parent_exam_id;
  IF v_total_questions < 1 THEN
    RAISE EXCEPTION 'Parent exam has no questions';
  END IF;

  -- Remove any previous splits of this parent before regenerating.
  DELETE FROM public.exams ex WHERE ex.parent_exam_id = p_parent_exam_id;

  v_start := 1;
  WHILE v_start <= v_total_questions LOOP
    v_end := LEAST(v_start + p_per_split_count - 1, v_total_questions);
    v_new_title := v_parent.title || ' (' || v_start || '-' || v_end || ')';

    INSERT INTO public.exams (
      course_id, title, exam_type, duration_minutes, negative_mark_per_question,
      total_marks, instructions, is_published, subject, restrict_solution, chapter,
      shared_course_ids, is_visible_on_free, category, is_readymade,
      readymade_course_ids, readymade_topic, readymade_category, readymade_sub_chapter,
      parent_exam_id, split_start, split_end
    ) VALUES (
      v_parent.course_id, v_new_title, v_parent.exam_type, GREATEST(1, CEIL((v_end - v_start + 1) * 30 / 60.0))::integer,
      v_parent.negative_mark_per_question, (v_end - v_start + 1), v_parent.instructions,
      v_parent.is_published, v_parent.subject, v_parent.restrict_solution, v_parent.chapter,
      v_parent.shared_course_ids, v_parent.is_visible_on_free, v_parent.category, true,
      v_parent.readymade_course_ids, v_parent.readymade_topic, v_parent.readymade_category, v_parent.readymade_sub_chapter,
      p_parent_exam_id, v_start, v_end
    )
    RETURNING exams.id INTO v_new_id;

    -- Copy the corresponding question slice into exam_questions, re-indexed
    -- from 1 for the new split exam.
    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_id, (row_number() OVER (ORDER BY eq.question_index))::integer,
      eq.question_text, eq.option_a, eq.option_b, eq.option_c, eq.option_d,
      eq.correct_option, eq.marks, eq.explanation, eq.question_type, eq.section
    FROM public.exam_questions eq
    WHERE eq.exam_id = p_parent_exam_id
      AND eq.question_index BETWEEN v_start AND v_end
    ORDER BY eq.question_index;

    id := v_new_id;
    title := v_new_title;
    split_start := v_start;
    split_end := v_end;
    RETURN NEXT;

    v_start := v_end + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_split_exams(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20260729000000_community_link_clicks.sql =====
-- Tracks whether a student has clicked "Join Now" on their enrolled courses'
-- FB/Telegram community links, so we can nudge them (every ~5 min) to join
-- the ones they haven't clicked yet.

CREATE TABLE IF NOT EXISTS public.community_link_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (resource_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_community_link_clicks_profile ON public.community_link_clicks(profile_id);

ALTER TABLE public.community_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own link clicks"
    ON public.community_link_clicks
    FOR INSERT
    TO authenticated
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can read their own link clicks"
    ON public.community_link_clicks
    FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

-- Admins can see everyone's click status (for future reporting if needed).
CREATE POLICY "Admins can read all link clicks"
    ON public.community_link_clicks
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Record a click (upsert — idempotent, safe to call every time the button is pressed).
CREATE OR REPLACE FUNCTION public.record_community_link_click(p_resource_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.community_link_clicks (resource_id, profile_id, clicked_at)
    VALUES (p_resource_id, auth.uid(), now())
    ON CONFLICT (resource_id, profile_id)
    DO UPDATE SET clicked_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_community_link_click(UUID) TO authenticated;


-- ===== 20260729000000_readymade_exam_analytics_rpc.sql =====
-- RPC: get_student_readymade_exam_analytics
-- Returns per-exam attempt history (date, time, score, rank) for ALL readymade
-- exams the current user has personally attempted. Used by the new
-- "ReadyMade Exam Report" tab on the Exam Analysis page.
--
-- Rank is computed the same way the live leaderboard does it: count of
-- attempts (for that same exam) with a strictly higher score, +1. Ties are
-- broken the same way the client-side leaderboard does (score desc, then
-- time_taken asc, then submitted_at asc) — for rank *number* purposes ties
-- on score alone are equivalent, so counting strictly-higher scores matches
-- the leaderboard's displayed rank for the tied group's first member.

CREATE OR REPLACE FUNCTION public.get_student_readymade_exam_analytics()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    WITH my_readymade_attempts AS (
        SELECT
            a.id AS attempt_id,
            a.exam_id,
            a.score,
            a.submitted_at,
            a.started_at,
            a.created_at
        FROM public.exam_attempts a
        JOIN public.exams e ON e.id = a.exam_id
        WHERE a.profile_id = v_user_id
          AND e.is_readymade = true
    ),
    my_ranks AS (
        SELECT
            mra.attempt_id,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = mra.exam_id
                  AND ea.score > mra.score
            ) AS rank,
            (
                SELECT COUNT(*)
                FROM public.exam_attempts ea
                WHERE ea.exam_id = mra.exam_id
            ) AS total_participants
        FROM my_readymade_attempts mra
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'attempt_id', mra.attempt_id,
            'exam_id', e.id,
            'title', e.title,
            'subject', e.subject,
            'chapter', e.chapter,
            'total_marks', e.total_marks,
            'score', mra.score,
            'rank', mr.rank,
            'total_participants', mr.total_participants,
            'attempt_date', COALESCE(mra.submitted_at, mra.started_at, mra.created_at)
        ) ORDER BY COALESCE(mra.submitted_at, mra.started_at, mra.created_at) DESC
    ) INTO v_result
    FROM my_readymade_attempts mra
    JOIN public.exams e ON e.id = mra.exam_id
    JOIN my_ranks mr ON mr.attempt_id = mra.attempt_id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_readymade_exam_analytics() TO authenticated;


-- ===== 20260729010000_exclude_readymade_from_routinewise_analytics.sql =====
-- Exclude readymade exams from get_student_exam_analytics().
-- The "Routinewise Exam Report" tab must only show scheduled/routine
-- (Live + its Practice fallback) exams — Readymade exams have their own
-- separate "ReadyMade Exam Report" tab powered by
-- get_student_readymade_exam_analytics().

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


-- ===== 20260729010000_student_progress_report.sql =====
-- Powers the "My Progress & History" report page: for the logged-in student,
-- returns every exam attempt (routine + readymade) joined with exam/course
-- info and the student's rank within that exam's leaderboard, computed via a
-- window function over leaderboard_exam_attempts (avoids N+1 client queries).

CREATE OR REPLACE FUNCTION public.get_my_exam_report()
RETURNS TABLE (
    attempt_id UUID,
    exam_id UUID,
    exam_title TEXT,
    exam_type TEXT,
    is_readymade BOOLEAN,
    readymade_topic TEXT,
    course_name TEXT,
    total_marks NUMERIC,
    score NUMERIC,
    submitted_at TIMESTAMPTZ,
    time_window_start TIMESTAMPTZ,
    rank BIGINT,
    total_participants BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH ranked AS (
        SELECT
            lea.id AS attempt_id,
            lea.exam_id,
            lea.profile_id,
            RANK() OVER (
                PARTITION BY lea.exam_id
                ORDER BY lea.score DESC, lea.time_taken_seconds ASC NULLS LAST, lea.submitted_at ASC
            ) AS rnk,
            COUNT(*) OVER (PARTITION BY lea.exam_id) AS participants
        FROM public.leaderboard_exam_attempts lea
    )
    SELECT
        ea.id AS attempt_id,
        e.id AS exam_id,
        e.title AS exam_title,
        e.exam_type,
        COALESCE(e.is_readymade, false) AS is_readymade,
        e.readymade_topic,
        c.name AS course_name,
        e.total_marks,
        ea.score,
        ea.submitted_at,
        e.time_window_start,
        r.rnk AS rank,
        r.participants AS total_participants
    FROM public.exam_attempts ea
    JOIN public.exams e ON e.id = ea.exam_id
    LEFT JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN ranked r ON r.attempt_id = ea.id
    WHERE ea.profile_id = auth.uid()
    ORDER BY ea.submitted_at DESC NULLS LAST;
END;
$$;


-- ===== 20260729120000_qp_attempts_question_ids.sql =====
alter table public.qp_attempts
  add column if not exists question_ids bigint[];
-- question_ids: ordered list of qp_mcqs.id used in this attempt, enabling exact "Practice Again" replay


-- ===== 20260729130000_readymade_mcq_counts_rpc.sql =====
-- RPC: get_readymade_mcq_counts
-- Fast server-side aggregation for the subject/chapter MCQ-count badges on
-- the Readymade Exam page. Previously the client fetched every exam row,
-- then paginated through every single exam_questions row (1000/request cap)
-- to count client-side — slow for subjects/chapters with many questions.
-- This does the counting in one SQL aggregate instead.
--
-- p_readymade_topics / p_readymade_categories: optional filters, same as the
-- "selectedParentTopics" / "selectedBoards" filters already used client-side.
-- Pass NULL or empty array to skip a filter.

CREATE OR REPLACE FUNCTION public.get_readymade_mcq_counts(
    p_readymade_topics text[] DEFAULT NULL,
    p_readymade_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_subject_counts jsonb;
    v_chapter_counts jsonb;
    v_subchapter_counts jsonb;
BEGIN
    WITH filtered_exams AS (
        SELECT e.id, e.subject, e.chapter, e.readymade_sub_chapter
        FROM public.exams e
        WHERE e.is_readymade = true
          AND e.is_published = true
          AND (p_readymade_topics IS NULL OR array_length(p_readymade_topics, 1) IS NULL OR e.readymade_topic = ANY(p_readymade_topics))
          AND (p_readymade_categories IS NULL OR array_length(p_readymade_categories, 1) IS NULL OR e.readymade_category = ANY(p_readymade_categories))
    ),
    exam_qcounts AS (
        SELECT fe.id AS exam_id, fe.subject, fe.chapter, fe.readymade_sub_chapter, COUNT(eq.id) AS qcount
        FROM filtered_exams fe
        LEFT JOIN public.exam_questions eq ON eq.exam_id = fe.id
        GROUP BY fe.id, fe.subject, fe.chapter, fe.readymade_sub_chapter
    ),
    subject_totals AS (
        SELECT s AS subject_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq, unnest(eq.subject) AS s
        GROUP BY s
    ),
    chapter_totals AS (
        SELECT eq.chapter AS chapter_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.chapter IS NOT NULL
        GROUP BY eq.chapter
    ),
    subchapter_totals AS (
        SELECT eq.chapter || '||' || eq.readymade_sub_chapter AS key_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.readymade_sub_chapter IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_sub_chapter
    )
    SELECT COALESCE(jsonb_object_agg(subject_name, total), '{}'::jsonb) INTO v_subject_counts FROM subject_totals;

    SELECT COALESCE(jsonb_object_agg(chapter_name, total), '{}'::jsonb) INTO v_chapter_counts FROM chapter_totals;

    SELECT COALESCE(jsonb_object_agg(key_name, total), '{}'::jsonb) INTO v_subchapter_counts FROM subchapter_totals;

    RETURN jsonb_build_object('subject_counts', v_subject_counts, 'chapter_counts', v_chapter_counts, 'subchapter_counts', v_subchapter_counts);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_readymade_mcq_counts(text[], text[]) TO authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON public.exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exams_readymade_published ON public.exams(is_readymade, is_published) WHERE is_readymade = true AND is_published = true;


-- ===== 20260729150000_create_custom_exam_rpc.sql =====
-- Custom Exam Builder: lets an enrolled user pick multiple readymade exams
-- across any subject/chapter, choose how many MCQs to pull from each
-- (defaulting to an even average), and get one combined shuffled exam.
--
-- Security: SECURITY DEFINER because a normal user has no INSERT grant on
-- exams/exam_questions. All access checks (auth, enrollment/unlock) are done
-- inside the function before anything is written.

CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],   -- how many MCQs to take from each exam, same order/length as p_exam_ids
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_enrolled_course_ids uuid[];
  v_is_unlocked boolean;
  v_total_duration int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  -- Collect the user's enrolled course ids once
  SELECT array_agg(course_id) INTO v_enrolled_course_ids
  FROM public.enrollments
  WHERE profile_id = v_user_id;

  v_enrolled_course_ids := COALESCE(v_enrolled_course_ids, '{}');

  -- Create the shell exam first
  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  -- Walk through each requested source exam
  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    -- Unlock check: same rule as the client's isExamUnlocked()
    v_is_unlocked := (
      (v_source.course_id IS NOT NULL AND v_source.course_id = ANY(v_enrolled_course_ids))
      OR (v_source.shared_course_ids IS NOT NULL AND v_source.shared_course_ids && v_enrolled_course_ids)
      OR (v_source.readymade_course_ids IS NOT NULL AND v_source.readymade_course_ids && v_enrolled_course_ids)
    );

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    v_total_duration := v_total_duration + COALESCE(v_source.duration_minutes, 0);

    -- Pull v_count random questions from this source exam, insert as new rows
    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count; -- assumes 1 mark/question default; refined below
  END LOOP;

  IF v_question_index = 0 THEN
    -- Nothing was actually inserted — clean up the shell and fail clearly
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  -- Re-shuffle final question_index order across the whole combined set,
  -- and recompute total_marks/duration from the actual inserted rows.
  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(v_question_index, 1) -- 1 min/question as a sane default
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;


-- ===== 20260729180000_fix_custom_exam_split_children.sql =====
-- Fix: create_custom_exam was allowing split-child exams to be passed in,
-- which have no course_id/shared_course_ids of their own (only the parent
-- exam carries access info), causing a false "not enrolled" error for
-- users who ARE enrolled in the parent exam's course.
-- Also refuses split-child exams outright with a clear message instead of
-- the misleading "not enrolled" error.

CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_enrolled_course_ids uuid[];
  v_is_unlocked boolean;
  v_total_duration int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  SELECT array_agg(course_id) INTO v_enrolled_course_ids
  FROM public.enrollments
  WHERE profile_id = v_user_id
    AND (expires_at IS NULL OR expires_at > now());

  v_enrolled_course_ids := COALESCE(v_enrolled_course_ids, '{}');

  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.parent_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected exam % is a split section, not a main readymade exam. Please pick the main exam.', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    v_is_unlocked := (
      COALESCE(v_source.is_visible_on_free, false)
      OR (v_source.course_id IS NOT NULL AND v_source.course_id = ANY(v_enrolled_course_ids))
      OR (v_source.shared_course_ids IS NOT NULL AND v_source.shared_course_ids && v_enrolled_course_ids)
      OR (v_source.readymade_course_ids IS NOT NULL AND v_source.readymade_course_ids && v_enrolled_course_ids)
    );

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    v_total_duration := v_total_duration + COALESCE(v_source.duration_minutes, 0);

    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count;
  END LOOP;

  IF v_question_index = 0 THEN
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(v_question_index, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;


-- ===== 20260729190000_custom_exam_admin_bypass.sql =====
-- Admins have no enrollments row (they use is_admin()/role-based access,
-- not the enrollments table), so create_custom_exam was blocking them with
-- "not enrolled" even though they can see/access every readymade exam on
-- the Readymade page. Add an admin bypass: is_admin() unlocks everything.

CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_enrolled_course_ids uuid[];
  v_is_unlocked boolean;
  v_total_duration int := 0;
  v_is_admin boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  v_is_admin := public.is_admin();

  SELECT array_agg(course_id) INTO v_enrolled_course_ids
  FROM public.enrollments
  WHERE profile_id = v_user_id
    AND (expires_at IS NULL OR expires_at > now());

  v_enrolled_course_ids := COALESCE(v_enrolled_course_ids, '{}');

  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.parent_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected exam % is a split section, not a main readymade exam. Please pick the main exam.', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    v_is_unlocked := (
      v_is_admin
      OR COALESCE(v_source.is_visible_on_free, false)
      OR (v_source.course_id IS NOT NULL AND v_source.course_id = ANY(v_enrolled_course_ids))
      OR (v_source.shared_course_ids IS NOT NULL AND v_source.shared_course_ids && v_enrolled_course_ids)
      OR (v_source.readymade_course_ids IS NOT NULL AND v_source.readymade_course_ids && v_enrolled_course_ids)
    );

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    v_total_duration := v_total_duration + COALESCE(v_source.duration_minutes, 0);

    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count;
  END LOOP;

  IF v_question_index = 0 THEN
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(v_question_index, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;


-- ===== 20260729200000_custom_exam_recursive_linked_courses.sql =====
-- Root cause fix: create_custom_exam's access check only looked at DIRECT
-- enrollments, but the proven working access-check (get_exam_questions_start,
-- used by TakeExam.tsx) also follows RECURSIVE linked_course_ids — a student
-- enrolled in Course A can have access to Course B's exams if A links to B.
-- That's why enrolled students who could open/take a readymade exam fine
-- were still getting "not enrolled" here. Now uses the identical recursive
-- logic so "if you can take it on Readymade, you can put it in Custom Exam".

CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_is_unlocked boolean;
  v_total_duration int := 0;
  v_is_admin boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  v_is_admin := public.is_admin();

  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.parent_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected exam % is a split section, not a main readymade exam. Please pick the main exam.', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    v_is_unlocked := v_is_admin OR COALESCE(v_source.is_visible_on_free, false);

    IF NOT v_is_unlocked THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = v_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_source.course_id IS NOT NULL AND aac.course_id = v_source.course_id)
            OR
            (v_source.shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.shared_course_ids))
            OR
            (v_source.readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.readymade_course_ids))
      ) INTO v_is_unlocked;
    END IF;

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    v_total_duration := v_total_duration + COALESCE(v_source.duration_minutes, 0);

    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count;
  END LOOP;

  IF v_question_index = 0 THEN
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(v_question_index, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;


-- ===== 20260729220000_custom_exam_30s_per_mcq.sql =====
-- Custom Exam duration was 1 minute per MCQ (duration_minutes = question_count).
-- Change to 30 seconds per MCQ, matching the standard exam-timing convention
-- used elsewhere in the app. Full function re-applied unchanged except the
-- final duration_minutes calculation.

CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_is_unlocked boolean;
  v_total_duration int := 0;
  v_is_admin boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  v_is_admin := public.is_admin();

  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.parent_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected exam % is a split section, not a main readymade exam. Please pick the main exam.', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    v_is_unlocked := v_is_admin OR COALESCE(v_source.is_visible_on_free, false);

    IF NOT v_is_unlocked THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = v_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_source.course_id IS NOT NULL AND aac.course_id = v_source.course_id)
            OR
            (v_source.shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.shared_course_ids))
            OR
            (v_source.readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.readymade_course_ids))
      ) INTO v_is_unlocked;
    END IF;

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    v_total_duration := v_total_duration + COALESCE(v_source.duration_minutes, 0);

    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count;
  END LOOP;

  IF v_question_index = 0 THEN
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  -- 30 seconds per MCQ instead of the previous 60 seconds per MCQ
  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(CEIL(v_question_index * 0.5)::int, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;


-- ===== 20260730000000_class_watch_tracking.sql =====
-- Powers "Class Report" inside My Progress & History: tracks how long each
-- student watches each class (live / recorded / archive), and lets us show
-- per-class watched-duration plus a rank (by watched duration) among peers.

CREATE TABLE IF NOT EXISTS public.class_watch_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('live', 'record', 'archive')),
    watched_seconds INTEGER NOT NULL DEFAULT 0,
    watch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One row per student per class per day per category, so re-watching the
    -- same class across multiple days accumulates as separate daily entries
    -- (useful for the day-range graph) while the same day's sessions merge.
    UNIQUE (profile_id, class_id, category, watch_date)
);

CREATE INDEX IF NOT EXISTS idx_class_watch_sessions_profile ON public.class_watch_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_class_watch_sessions_class ON public.class_watch_sessions(class_id);

ALTER TABLE public.class_watch_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watch sessions"
    ON public.class_watch_sessions FOR SELECT
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own watch sessions"
    ON public.class_watch_sessions FOR INSERT
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own watch sessions"
    ON public.class_watch_sessions FOR UPDATE
    USING (auth.uid() = profile_id);

-- Called periodically (e.g. every 30-60s while playing, and on unmount) from
-- ClassPlayer with an incremental number of seconds watched. Accumulates
-- into today's row for that student+class+category rather than overwriting.
CREATE OR REPLACE FUNCTION public.log_class_watch_time(
    p_class_id UUID,
    p_category TEXT,
    p_seconds INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.class_watch_sessions (profile_id, class_id, category, watched_seconds, watch_date, last_watched_at)
    VALUES (auth.uid(), p_class_id, p_category, GREATEST(p_seconds, 0), CURRENT_DATE, now())
    ON CONFLICT (profile_id, class_id, category, watch_date)
    DO UPDATE SET
        watched_seconds = public.class_watch_sessions.watched_seconds + GREATEST(p_seconds, 0),
        last_watched_at = now();
END;
$$;

-- Report RPC: for the logged-in student, returns one row per class they've
-- watched (summed across days), with title/date/category and their rank by
-- total watched_seconds among all students who watched that same class in
-- that same category.
CREATE OR REPLACE FUNCTION public.get_my_class_report()
RETURNS TABLE (
    class_id UUID,
    class_title TEXT,
    category TEXT,
    course_name TEXT,
    class_start_at TIMESTAMPTZ,
    total_watched_seconds BIGINT,
    last_watched_at TIMESTAMPTZ,
    rank BIGINT,
    total_participants BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH per_student_totals AS (
        SELECT
            cws.profile_id,
            cws.class_id,
            cws.category,
            SUM(cws.watched_seconds) AS total_seconds,
            MAX(cws.last_watched_at) AS last_watched
        FROM public.class_watch_sessions cws
        GROUP BY cws.profile_id, cws.class_id, cws.category
    ),
    ranked AS (
        SELECT
            pst.*,
            RANK() OVER (
                PARTITION BY pst.class_id, pst.category
                ORDER BY pst.total_seconds DESC
            ) AS rnk,
            COUNT(*) OVER (PARTITION BY pst.class_id, pst.category) AS participants
        FROM per_student_totals pst
    )
    SELECT
        c.id AS class_id,
        c.title AS class_title,
        r.category,
        co.name AS course_name,
        c.start_at AS class_start_at,
        r.total_seconds AS total_watched_seconds,
        r.last_watched AS last_watched_at,
        r.rnk AS rank,
        r.participants AS total_participants
    FROM ranked r
    JOIN public.classes c ON c.id = r.class_id
    LEFT JOIN public.courses co ON co.id = c.course_id
    WHERE r.profile_id = auth.uid()
    ORDER BY r.last_watched DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_class_watch_time(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_report() TO authenticated;


-- ===== 20260730010000_exam_weakness_report_rpc.sql =====
-- Powers "Exam Weakness Report" inside My Weak Topic and Analysis.
-- Combines every exam-taking surface (routine Live, routine Practice,
-- Readymade Exam, Quick Practice, Unlimited Mock Test — all of these write
-- into exam_attempts + exam_answers the same way) into one per-subject and
-- per-chapter accuracy breakdown for the logged-in student, plus a daily
-- score trend so the UI can apply its own day-range filter.
--
-- Rule-based (no AI): a subject/chapter is "weak" purely by comparing its
-- accuracy % against the student's own overall accuracy % — the frontend
-- decides the exact threshold/labels.

CREATE OR REPLACE FUNCTION public.get_my_exam_weakness_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'subjects', '[]'::jsonb,
            'chapters', '[]'::jsonb,
            'daily', '[]'::jsonb,
            'question_types', '[]'::jsonb,
            'overall_accuracy', 0,
            'total_answered', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT id, exam_id, submitted_at, started_at, created_at
        FROM public.exam_attempts
        WHERE profile_id = v_user_id
    ),
    my_answers AS (
        SELECT
            ea.attempt_id,
            ea.question_id,
            ea.is_correct,
            ma.exam_id,
            COALESCE(ma.submitted_at, ma.started_at, ma.created_at) AS answer_date
        FROM public.exam_answers ea
        JOIN my_attempts ma ON ma.id = ea.attempt_id
        WHERE ea.is_correct IS NOT NULL
    ),
    -- One row per answer, unnested across each exam's subject array so a
    -- multi-subject exam contributes to every one of its subjects.
    answers_by_subject AS (
        SELECT
            mya.is_correct,
            mya.answer_date,
            subj AS subject_name
        FROM my_answers mya
        JOIN public.exams e ON e.id = mya.exam_id
        CROSS JOIN LATERAL unnest(
            CASE WHEN e.subject IS NULL OR array_length(e.subject, 1) IS NULL
                 THEN ARRAY['Uncategorized']
                 ELSE e.subject
            END
        ) AS subj
    ),
    answers_by_chapter AS (
        SELECT
            mya.is_correct,
            mya.answer_date,
            COALESCE(e.chapter, 'Uncategorized') AS chapter_name,
            COALESCE(e.subject[1], 'Uncategorized') AS subject_name
        FROM my_answers mya
        JOIN public.exams e ON e.id = mya.exam_id
    ),
    answers_by_qtype AS (
        SELECT
            mya.is_correct,
            COALESCE(eq.question_type, 'General') AS question_type
        FROM my_answers mya
        JOIN public.exam_questions eq ON eq.id = mya.question_id
    ),
    subject_stats AS (
        SELECT
            subject_name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_subject
        GROUP BY subject_name
    ),
    chapter_stats AS (
        SELECT
            subject_name,
            chapter_name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_chapter
        GROUP BY subject_name, chapter_name
    ),
    qtype_stats AS (
        SELECT
            question_type,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_qtype
        GROUP BY question_type
    ),
    daily_stats AS (
        SELECT
            answer_date::date AS day,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers
        GROUP BY answer_date::date
    ),
    overall AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers
    )
    SELECT jsonb_build_object(
        'subjects', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM subject_stats
        ), '[]'::jsonb),
        'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name,
                'chapter', chapter_name,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM chapter_stats
        ), '[]'::jsonb),
        'question_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'question_type', question_type,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM qtype_stats
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', day,
                'total', total,
                'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY day ASC)
            FROM daily_stats
        ), '[]'::jsonb),
        'overall_accuracy', COALESCE((SELECT ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1) FROM overall), 0),
        'total_answered', COALESCE((SELECT total FROM overall), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_exam_weakness_report() TO authenticated;


-- ===== 20260730020000_class_report_add_subject.sql =====
-- Adds `subject` (text[]) to get_my_class_report() output so the Class
-- Weakness Report can aggregate total watched time per subject and flag
-- subjects with comparatively low watch time. Everything else unchanged.

CREATE OR REPLACE FUNCTION public.get_my_class_report()
RETURNS TABLE (
    class_id UUID,
    class_title TEXT,
    category TEXT,
    course_name TEXT,
    class_start_at TIMESTAMPTZ,
    total_watched_seconds BIGINT,
    last_watched_at TIMESTAMPTZ,
    rank BIGINT,
    total_participants BIGINT,
    subject TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH per_student_totals AS (
        SELECT
            cws.profile_id,
            cws.class_id,
            cws.category,
            SUM(cws.watched_seconds) AS total_seconds,
            MAX(cws.last_watched_at) AS last_watched
        FROM public.class_watch_sessions cws
        GROUP BY cws.profile_id, cws.class_id, cws.category
    ),
    ranked AS (
        SELECT
            pst.*,
            RANK() OVER (
                PARTITION BY pst.class_id, pst.category
                ORDER BY pst.total_seconds DESC
            ) AS rnk,
            COUNT(*) OVER (PARTITION BY pst.class_id, pst.category) AS participants
        FROM per_student_totals pst
    )
    SELECT
        c.id AS class_id,
        c.title AS class_title,
        r.category,
        co.name AS course_name,
        c.start_at AS class_start_at,
        r.total_seconds AS total_watched_seconds,
        r.last_watched AS last_watched_at,
        r.rnk AS rank,
        r.participants AS total_participants,
        c.subject AS subject
    FROM ranked r
    JOIN public.classes c ON c.id = r.class_id
    LEFT JOIN public.courses co ON co.id = c.course_id
    WHERE r.profile_id = auth.uid()
    ORDER BY r.last_watched DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_class_report() TO authenticated;


-- ===== 20260730030000_fix_class_report_drop_function.sql =====
-- Fix for 42P13: return type changed (added `subject` column), so the
-- function must be dropped before being recreated.

DROP FUNCTION IF EXISTS public.get_my_class_report();

CREATE OR REPLACE FUNCTION public.get_my_class_report()
RETURNS TABLE (
    class_id UUID,
    class_title TEXT,
    category TEXT,
    course_name TEXT,
    class_start_at TIMESTAMPTZ,
    total_watched_seconds BIGINT,
    last_watched_at TIMESTAMPTZ,
    rank BIGINT,
    total_participants BIGINT,
    subject TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH per_student_totals AS (
        SELECT
            cws.profile_id,
            cws.class_id,
            cws.category,
            SUM(cws.watched_seconds) AS total_seconds,
            MAX(cws.last_watched_at) AS last_watched
        FROM public.class_watch_sessions cws
        GROUP BY cws.profile_id, cws.class_id, cws.category
    ),
    ranked AS (
        SELECT
            pst.*,
            RANK() OVER (
                PARTITION BY pst.class_id, pst.category
                ORDER BY pst.total_seconds DESC
            ) AS rnk,
            COUNT(*) OVER (PARTITION BY pst.class_id, pst.category) AS participants
        FROM per_student_totals pst
    )
    SELECT
        c.id AS class_id,
        c.title AS class_title,
        r.category,
        co.name AS course_name,
        c.start_at AS class_start_at,
        r.total_seconds AS total_watched_seconds,
        r.last_watched AS last_watched_at,
        r.rnk AS rank,
        r.participants AS total_participants,
        c.subject AS subject
    FROM ranked r
    JOIN public.classes c ON c.id = r.class_id
    LEFT JOIN public.courses co ON co.id = c.course_id
    WHERE r.profile_id = auth.uid()
    ORDER BY r.last_watched DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_class_report() TO authenticated;


-- ===== 20260730040000_overall_suggestion_rpc.sql =====
-- Powers "Overall Suggestion" inside My Weak Topic and Analysis.
-- Returns, for the logged-in student:
--   1) A per-exam rank trend (date, rank, total_participants, percentile)
--      built directly from exam_attempts (same rank logic as the live
--      leaderboard: count of strictly-higher scores + 1).
--   2) A summary of recent site activity (exam count, class watch time)
--      so the frontend can combine both into a single rule-based tip
--      (e.g. "watch time is fine but rank is falling — focus on weak
--      chapters" vs "few exams attempted recently — attempt more to
--      improve rank"). All suggestion wording/thresholds live in the
--      frontend; this RPC only supplies the raw numbers.

CREATE OR REPLACE FUNCTION public.get_my_overall_activity_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'rank_trend', '[]'::jsonb,
            'total_exams', 0,
            'total_watch_seconds', 0,
            'avg_percentile', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT
            a.id,
            a.exam_id,
            a.score,
            COALESCE(a.submitted_at, a.started_at, a.created_at) AS attempt_date
        FROM public.exam_attempts a
        WHERE a.profile_id = v_user_id
    ),
    ranks AS (
        SELECT
            ma.id,
            ma.exam_id,
            ma.attempt_date,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id AND ea.score > ma.score
            ) AS rank,
            (
                SELECT COUNT(*)
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id
            ) AS total_participants
        FROM my_attempts ma
    ),
    rank_trend_rows AS (
        SELECT
            r.attempt_date,
            r.rank,
            r.total_participants,
            CASE WHEN r.total_participants > 1
                 THEN ROUND((1 - ((r.rank - 1)::numeric / NULLIF(r.total_participants - 1, 0))) * 100, 1)
                 ELSE 100
            END AS percentile
        FROM ranks r
        ORDER BY r.attempt_date ASC
    ),
    watch_total AS (
        SELECT COALESCE(SUM(watched_seconds), 0) AS total_seconds
        FROM public.class_watch_sessions
        WHERE profile_id = v_user_id
    )
    SELECT jsonb_build_object(
        'rank_trend', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', attempt_date,
                'rank', rank,
                'total_participants', total_participants,
                'percentile', percentile
            ))
            FROM rank_trend_rows
        ), '[]'::jsonb),
        'total_exams', (SELECT COUNT(*) FROM my_attempts),
        'total_watch_seconds', (SELECT total_seconds FROM watch_total),
        'avg_percentile', COALESCE((SELECT ROUND(AVG(percentile), 1) FROM rank_trend_rows), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_overall_activity_report() TO authenticated;


-- ===== 20260730050000_fix_exam_weakness_use_attempts_answers_jsonb.sql =====
-- FIX: the previous version of get_my_exam_weakness_report() read from
-- public.exam_answers, but that table is never actually populated by the
-- app — submit_exam_attempt() stores each answer as a jsonb array
-- ({question_id, selected_option}) directly inside exam_attempts.answers.
-- This rewrite unnests that jsonb column and joins against
-- exam_questions.correct_option to determine correctness, so ALL historical
-- attempts (not just ones after some future change) are included.

CREATE OR REPLACE FUNCTION public.get_my_exam_weakness_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'subjects', '[]'::jsonb,
            'chapters', '[]'::jsonb,
            'daily', '[]'::jsonb,
            'question_types', '[]'::jsonb,
            'overall_accuracy', 0,
            'total_answered', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT id, exam_id, answers, COALESCE(submitted_at, started_at, created_at) AS attempt_date
        FROM public.exam_attempts
        WHERE profile_id = v_user_id AND answers IS NOT NULL
    ),
    -- Unnest each attempt's answers jsonb array into one row per question,
    -- then join to exam_questions to find the correct option and derive
    -- is_correct ourselves (only for questions the student actually
    -- selected an option for — skipped questions don't count either way).
    my_answers AS (
        SELECT
            ma.exam_id,
            ma.attempt_date,
            (ans->>'question_id')::uuid AS question_id,
            (ans->>'selected_option') AS selected_option,
            eq.correct_option,
            eq.question_type,
            (ans->>'selected_option') IS NOT NULL
                AND (ans->>'selected_option') = eq.correct_option::text AS is_correct
        FROM my_attempts ma
        CROSS JOIN LATERAL jsonb_array_elements(ma.answers) AS ans
        JOIN public.exam_questions eq ON eq.id = (ans->>'question_id')::uuid
        WHERE (ans->>'selected_option') IS NOT NULL
    ),
    answers_by_subject AS (
        SELECT
            mya.is_correct,
            mya.attempt_date,
            subj AS subject_name
        FROM my_answers mya
        JOIN public.exams e ON e.id = mya.exam_id
        CROSS JOIN LATERAL unnest(
            CASE WHEN e.subject IS NULL OR array_length(e.subject, 1) IS NULL
                 THEN ARRAY['Uncategorized']
                 ELSE e.subject
            END
        ) AS subj
    ),
    answers_by_chapter AS (
        SELECT
            mya.is_correct,
            mya.attempt_date,
            COALESCE(e.chapter, 'Uncategorized') AS chapter_name,
            COALESCE(e.subject[1], 'Uncategorized') AS subject_name
        FROM my_answers mya
        JOIN public.exams e ON e.id = mya.exam_id
    ),
    answers_by_qtype AS (
        SELECT
            is_correct,
            COALESCE(question_type, 'General') AS question_type
        FROM my_answers
    ),
    subject_stats AS (
        SELECT subject_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_subject GROUP BY subject_name
    ),
    chapter_stats AS (
        SELECT subject_name, chapter_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_chapter GROUP BY subject_name, chapter_name
    ),
    qtype_stats AS (
        SELECT question_type, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_qtype GROUP BY question_type
    ),
    daily_stats AS (
        SELECT attempt_date::date AS day, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers GROUP BY attempt_date::date
    ),
    overall AS (
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct FROM my_answers
    )
    SELECT jsonb_build_object(
        'subjects', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM subject_stats
        ), '[]'::jsonb),
        'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'chapter', chapter_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM chapter_stats
        ), '[]'::jsonb),
        'question_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'question_type', question_type, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC)
            FROM qtype_stats
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', day, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY day ASC)
            FROM daily_stats
        ), '[]'::jsonb),
        'overall_accuracy', COALESCE((SELECT ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1) FROM overall), 0),
        'total_answered', COALESCE((SELECT total FROM overall), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_exam_weakness_report() TO authenticated;


-- ===== 20260730060000_include_quick_practice_in_weakness_report.sql =====
-- Extends get_my_exam_weakness_report() to also fold in Quick Practice
-- attempts (public.qp_attempts), which is a completely separate system
-- from exam_attempts/exams and was previously NOT included — meaning
-- subject/chapter weakness only reflected Live/Practice/Readymade exams,
-- not Quick Practice sessions. Each qp_attempts row's `details` jsonb array
-- already carries subject_name/chapter_name/correct per question, so it
-- merges in directly without needing exam_questions.

CREATE OR REPLACE FUNCTION public.get_my_exam_weakness_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'subjects', '[]'::jsonb, 'chapters', '[]'::jsonb, 'daily', '[]'::jsonb,
            'question_types', '[]'::jsonb, 'overall_accuracy', 0, 'total_answered', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT id, exam_id, answers, COALESCE(submitted_at, started_at, created_at) AS attempt_date
        FROM public.exam_attempts
        WHERE profile_id = v_user_id AND answers IS NOT NULL
    ),
    -- Routine/Readymade exam answers (Live, Practice, Readymade — everything
    -- that flows through exam_attempts/submit_exam_attempt).
    exam_answers_expanded AS (
        SELECT
            ma.attempt_date,
            (ans->>'question_id')::uuid AS question_id,
            (ans->>'selected_option') AS selected_option,
            eq.correct_option,
            eq.question_type,
            (ans->>'selected_option') IS NOT NULL
                AND (ans->>'selected_option') = eq.correct_option::text AS is_correct,
            CASE WHEN e.subject IS NULL OR array_length(e.subject, 1) IS NULL
                 THEN ARRAY['Uncategorized'] ELSE e.subject END AS subjects,
            COALESCE(e.chapter, 'Uncategorized') AS chapter_name
        FROM my_attempts ma
        CROSS JOIN LATERAL jsonb_array_elements(ma.answers) AS ans
        JOIN public.exam_questions eq ON eq.id = (ans->>'question_id')::uuid
        JOIN public.exams e ON e.id = ma.exam_id
        WHERE (ans->>'selected_option') IS NOT NULL
    ),
    -- Quick Practice attempts (separate qp_attempts system — each `details`
    -- element already has subject_name/chapter_name/correct baked in).
    qp_answers_expanded AS (
        SELECT
            qa.created_at AS attempt_date,
            (d->>'correct')::boolean AS is_correct,
            'MCQ'::text AS question_type,
            ARRAY[COALESCE(d->>'subject_name', 'Uncategorized')] AS subjects,
            COALESCE(d->>'chapter_name', 'Uncategorized') AS chapter_name
        FROM public.qp_attempts qa
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qa.details, '[]'::jsonb)) AS d
        WHERE qa.user_id = v_user_id
    ),
    -- Unified per-answer rows across BOTH sources.
    my_answers AS (
        SELECT attempt_date, is_correct, question_type, subjects, chapter_name FROM exam_answers_expanded
        UNION ALL
        SELECT attempt_date, is_correct, question_type, subjects, chapter_name FROM qp_answers_expanded
    ),
    answers_by_subject AS (
        SELECT mya.is_correct, mya.attempt_date, subj AS subject_name
        FROM my_answers mya
        CROSS JOIN LATERAL unnest(mya.subjects) AS subj
    ),
    answers_by_chapter AS (
        SELECT is_correct, attempt_date, chapter_name, subjects[1] AS subject_name
        FROM my_answers
    ),
    answers_by_qtype AS (
        SELECT is_correct, COALESCE(question_type, 'General') AS question_type
        FROM my_answers
    ),
    subject_stats AS (
        SELECT subject_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_subject GROUP BY subject_name
    ),
    chapter_stats AS (
        SELECT subject_name, chapter_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_chapter GROUP BY subject_name, chapter_name
    ),
    qtype_stats AS (
        SELECT question_type, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_qtype GROUP BY question_type
    ),
    daily_stats AS (
        SELECT attempt_date::date AS day, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers GROUP BY attempt_date::date
    ),
    overall AS (
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct FROM my_answers
    )
    SELECT jsonb_build_object(
        'subjects', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM subject_stats
        ), '[]'::jsonb),
        'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'chapter', chapter_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM chapter_stats
        ), '[]'::jsonb),
        'question_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'question_type', question_type, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM qtype_stats
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', day, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY day ASC) FROM daily_stats
        ), '[]'::jsonb),
        'overall_accuracy', COALESCE((SELECT ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1) FROM overall), 0),
        'total_answered', COALESCE((SELECT total FROM overall), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_exam_weakness_report() TO authenticated;


-- ===== 20260730070000_overall_suggestion_add_quick_practice.sql =====
-- Adds total_quick_practice_sessions to get_my_overall_activity_report()
-- so "Overall Suggestion" reflects Quick Practice activity too (previously
-- only routine/readymade exam_attempts were counted in total_exams — Quick
-- Practice sessions, tracked separately in qp_attempts, were invisible).
-- rank_trend intentionally stays exam_attempts-only since Quick Practice
-- has no peer-ranking concept.

CREATE OR REPLACE FUNCTION public.get_my_overall_activity_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'rank_trend', '[]'::jsonb,
            'total_exams', 0,
            'total_quick_practice_sessions', 0,
            'total_watch_seconds', 0,
            'avg_percentile', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT
            a.id,
            a.exam_id,
            a.score,
            COALESCE(a.submitted_at, a.started_at, a.created_at) AS attempt_date
        FROM public.exam_attempts a
        WHERE a.profile_id = v_user_id
    ),
    ranks AS (
        SELECT
            ma.id,
            ma.exam_id,
            ma.attempt_date,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id AND ea.score > ma.score
            ) AS rank,
            (
                SELECT COUNT(*)
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id
            ) AS total_participants
        FROM my_attempts ma
    ),
    rank_trend_rows AS (
        SELECT
            r.attempt_date,
            r.rank,
            r.total_participants,
            CASE WHEN r.total_participants > 1
                 THEN ROUND((1 - ((r.rank - 1)::numeric / NULLIF(r.total_participants - 1, 0))) * 100, 1)
                 ELSE 100
            END AS percentile
        FROM ranks r
        ORDER BY r.attempt_date ASC
    ),
    watch_total AS (
        SELECT COALESCE(SUM(watched_seconds), 0) AS total_seconds
        FROM public.class_watch_sessions
        WHERE profile_id = v_user_id
    ),
    qp_total AS (
        SELECT COUNT(*) AS total_sessions
        FROM public.qp_attempts
        WHERE user_id = v_user_id
    )
    SELECT jsonb_build_object(
        'rank_trend', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', attempt_date,
                'rank', rank,
                'total_participants', total_participants,
                'percentile', percentile
            ))
            FROM rank_trend_rows
        ), '[]'::jsonb),
        'total_exams', (SELECT COUNT(*) FROM my_attempts),
        'total_quick_practice_sessions', (SELECT total_sessions FROM qp_total),
        'total_watch_seconds', (SELECT total_seconds FROM watch_total),
        'avg_percentile', COALESCE((SELECT ROUND(AVG(percentile), 1) FROM rank_trend_rows), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_overall_activity_report() TO authenticated;


-- ===== 20260730080000_include_mock_test_in_weakness_report.sql =====
-- Extends get_my_exam_weakness_report() to also fold in Unlimited Mock Test
-- attempts (public.mock_exam_attempts), which was completely missing —
-- weakness/subject/chapter stats previously only reflected Live/Practice/
-- Readymade exams (exam_attempts) and Quick Practice (qp_attempts), silently
-- excluding every Mock Test attempt.
--
-- mock_exam_attempts stores answers as {question_id: selected_option} (a
-- plain object, not an array like exam_attempts.answers) plus a
-- questions_snapshot jsonb array carrying each question's id/correct_option/
-- subject/chapter directly, so no join to mock_exam_questions is needed (and
-- historical/unlimited-pool attempts have mock_exam_id = null anyway).

CREATE OR REPLACE FUNCTION public.get_my_exam_weakness_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'subjects', '[]'::jsonb, 'chapters', '[]'::jsonb, 'daily', '[]'::jsonb,
            'question_types', '[]'::jsonb, 'overall_accuracy', 0, 'total_answered', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT id, exam_id, answers, COALESCE(submitted_at, started_at, created_at) AS attempt_date
        FROM public.exam_attempts
        WHERE profile_id = v_user_id AND answers IS NOT NULL
    ),
    -- Routine/Readymade exam answers (Live, Practice, Readymade — everything
    -- that flows through exam_attempts/submit_exam_attempt).
    exam_answers_expanded AS (
        SELECT
            ma.attempt_date,
            (ans->>'question_id')::uuid AS question_id,
            (ans->>'selected_option') AS selected_option,
            eq.correct_option,
            eq.question_type,
            (ans->>'selected_option') IS NOT NULL
                AND (ans->>'selected_option') = eq.correct_option::text AS is_correct,
            CASE WHEN e.subject IS NULL OR array_length(e.subject, 1) IS NULL
                 THEN ARRAY['Uncategorized'] ELSE e.subject END AS subjects,
            COALESCE(e.chapter, 'Uncategorized') AS chapter_name
        FROM my_attempts ma
        CROSS JOIN LATERAL jsonb_array_elements(ma.answers) AS ans
        JOIN public.exam_questions eq ON eq.id = (ans->>'question_id')::uuid
        JOIN public.exams e ON e.id = ma.exam_id
        WHERE (ans->>'selected_option') IS NOT NULL
    ),
    -- Quick Practice attempts (separate qp_attempts system — each `details`
    -- element already has subject_name/chapter_name/correct baked in).
    qp_answers_expanded AS (
        SELECT
            qa.created_at AS attempt_date,
            (d->>'correct')::boolean AS is_correct,
            'MCQ'::text AS question_type,
            ARRAY[COALESCE(d->>'subject_name', 'Uncategorized')] AS subjects,
            COALESCE(d->>'chapter_name', 'Uncategorized') AS chapter_name
        FROM public.qp_attempts qa
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qa.details, '[]'::jsonb)) AS d
        WHERE qa.user_id = v_user_id
    ),
    -- Unlimited Mock Test attempts — questions_snapshot carries each
    -- question's id/correct_option/subject/chapter; answers is a plain
    -- {question_id: selected_option} object, not an array.
    mock_attempts AS (
        SELECT id, answers, questions_snapshot, subject, chapter,
               COALESCE(submitted_at, started_at) AS attempt_date
        FROM public.mock_exam_attempts
        WHERE user_id = v_user_id AND questions_snapshot IS NOT NULL
    ),
    mock_answers_expanded AS (
        SELECT
            ma.attempt_date,
            (ma.answers->>(q->>'id')) AS selected_option,
            (q->>'correct_option') AS correct_option,
            (ma.answers->>(q->>'id')) IS NOT NULL
                AND (ma.answers->>(q->>'id')) = (q->>'correct_option') AS is_correct,
            ARRAY[COALESCE(q->>'subject', ma.subject, 'Uncategorized')] AS subjects,
            COALESCE(q->>'chapter', ma.chapter, 'Uncategorized') AS chapter_name
        FROM mock_attempts ma
        CROSS JOIN LATERAL jsonb_array_elements(ma.questions_snapshot) AS q
        WHERE (ma.answers->>(q->>'id')) IS NOT NULL
    ),
    -- Unified per-answer rows across ALL THREE sources.
    my_answers AS (
        SELECT attempt_date, is_correct, question_type, subjects, chapter_name FROM exam_answers_expanded
        UNION ALL
        SELECT attempt_date, is_correct, question_type, subjects, chapter_name FROM qp_answers_expanded
        UNION ALL
        SELECT attempt_date, is_correct, 'MCQ'::text AS question_type, subjects, chapter_name FROM mock_answers_expanded
    ),
    answers_by_subject AS (
        SELECT mya.is_correct, mya.attempt_date, subj AS subject_name
        FROM my_answers mya
        CROSS JOIN LATERAL unnest(mya.subjects) AS subj
    ),
    answers_by_chapter AS (
        SELECT is_correct, attempt_date, chapter_name, subjects[1] AS subject_name
        FROM my_answers
    ),
    answers_by_qtype AS (
        SELECT is_correct, COALESCE(question_type, 'General') AS question_type
        FROM my_answers
    ),
    subject_stats AS (
        SELECT subject_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_subject GROUP BY subject_name
    ),
    chapter_stats AS (
        SELECT subject_name, chapter_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_chapter GROUP BY subject_name, chapter_name
    ),
    qtype_stats AS (
        SELECT question_type, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM answers_by_qtype GROUP BY question_type
    ),
    daily_stats AS (
        SELECT attempt_date::date AS day, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM my_answers GROUP BY attempt_date::date
    ),
    overall AS (
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_correct) AS correct FROM my_answers
    )
    SELECT jsonb_build_object(
        'subjects', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM subject_stats
        ), '[]'::jsonb),
        'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'subject', subject_name, 'chapter', chapter_name, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM chapter_stats
        ), '[]'::jsonb),
        'question_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'question_type', question_type, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY (correct::numeric / NULLIF(total, 0)) ASC) FROM qtype_stats
        ), '[]'::jsonb),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', day, 'total', total, 'correct', correct,
                'accuracy', ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1)
            ) ORDER BY day ASC) FROM daily_stats
        ), '[]'::jsonb),
        'overall_accuracy', COALESCE((SELECT ROUND((correct::numeric / NULLIF(total, 0)) * 100, 1) FROM overall), 0),
        'total_answered', COALESCE((SELECT total FROM overall), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_exam_weakness_report() TO authenticated;


-- ===== 20260730090000_include_mock_test_in_overall_suggestion.sql =====
-- Adds total_mock_test_sessions to get_my_overall_activity_report() — Mock
-- Test attempts (public.mock_exam_attempts) were completely missing from
-- Overall Suggestion, same gap as Quick Practice had before.
-- rank_trend stays exam_attempts-only (same reasoning as Quick Practice):
-- Mock Test's unlimited-pool attempts have mock_exam_id = null and no
-- shared peer pool to rank against.

CREATE OR REPLACE FUNCTION public.get_my_overall_activity_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'rank_trend', '[]'::jsonb,
            'total_exams', 0,
            'total_quick_practice_sessions', 0,
            'total_mock_test_sessions', 0,
            'total_watch_seconds', 0,
            'avg_percentile', 0
        );
    END IF;

    WITH my_attempts AS (
        SELECT
            a.id,
            a.exam_id,
            a.score,
            COALESCE(a.submitted_at, a.started_at, a.created_at) AS attempt_date
        FROM public.exam_attempts a
        WHERE a.profile_id = v_user_id
    ),
    ranks AS (
        SELECT
            ma.id,
            ma.exam_id,
            ma.attempt_date,
            (
                SELECT COUNT(*) + 1
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id AND ea.score > ma.score
            ) AS rank,
            (
                SELECT COUNT(*)
                FROM public.exam_attempts ea
                WHERE ea.exam_id = ma.exam_id
            ) AS total_participants
        FROM my_attempts ma
    ),
    rank_trend_rows AS (
        SELECT
            r.attempt_date,
            r.rank,
            r.total_participants,
            CASE WHEN r.total_participants > 1
                 THEN ROUND((1 - ((r.rank - 1)::numeric / NULLIF(r.total_participants - 1, 0))) * 100, 1)
                 ELSE 100
            END AS percentile
        FROM ranks r
        ORDER BY r.attempt_date ASC
    ),
    watch_total AS (
        SELECT COALESCE(SUM(watched_seconds), 0) AS total_seconds
        FROM public.class_watch_sessions
        WHERE profile_id = v_user_id
    ),
    qp_total AS (
        SELECT COUNT(*) AS total_sessions
        FROM public.qp_attempts
        WHERE user_id = v_user_id
    ),
    mock_total AS (
        SELECT COUNT(*) AS total_sessions
        FROM public.mock_exam_attempts
        WHERE user_id = v_user_id AND submitted_at IS NOT NULL
    )
    SELECT jsonb_build_object(
        'rank_trend', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'date', attempt_date,
                'rank', rank,
                'total_participants', total_participants,
                'percentile', percentile
            ))
            FROM rank_trend_rows
        ), '[]'::jsonb),
        'total_exams', (SELECT COUNT(*) FROM my_attempts),
        'total_quick_practice_sessions', (SELECT total_sessions FROM qp_total),
        'total_mock_test_sessions', (SELECT total_sessions FROM mock_total),
        'total_watch_seconds', (SELECT total_seconds FROM watch_total),
        'avg_percentile', COALESCE((SELECT ROUND(AVG(percentile), 1) FROM rank_trend_rows), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_overall_activity_report() TO authenticated;


-- ===== 20260730100000_top_performer_rpc.sql =====
-- Powers the Dashboard's "Top Performer" page: a site-wide leaderboard
-- ranking every enrolled user by a composite activity+performance score,
-- computed separately for each day-range (today, 3/7/15/30 days).
--
-- Composite score weighting (out of 100), exam performance weighted highest
-- per product decision ("exam er beparta beshi priority pabe"):
--   40% — average exam score percentage (score/total_marks), rewards higher marks
--   20% — exam volume (how many exams attempted, log-scaled so 1 huge outlier
--         doesn't dominate over someone who attempted many exams consistently)
--   15% — regularity (distinct active days / days in period)
--   15% — focus timer total duration (site-wide leaderboard already tracks this)
--   10% — class watch time
-- Tie-breaker after composite score: same average score → whoever averaged
-- LESS time per question wins (faster + accurate ranks above slower + accurate).
--
-- All raw numbers are returned alongside the score so the frontend detail
-- view ("বিস্তারিত") can show a full breakdown, not just the final rank.

CREATE OR REPLACE FUNCTION public.get_top_performers(p_days integer DEFAULT 30)
RETURNS TABLE (
    profile_id uuid,
    full_name text,
    avatar_url text,
    exam_count bigint,
    avg_score_pct numeric,
    avg_seconds_per_question numeric,
    class_watch_seconds bigint,
    focus_seconds bigint,
    active_days bigint,
    composite_score numeric,
    rank_position bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start timestamptz;
BEGIN
    v_period_start := CASE
        WHEN p_days <= 0 THEN date_trunc('day', now()) -- "today"
        ELSE now() - (p_days || ' days')::interval
    END;

    RETURN QUERY
    WITH enrolled_users AS (
        SELECT DISTINCT e.profile_id
        FROM public.enrollments e
    ),
    exam_stats AS (
        SELECT
            a.profile_id,
            COUNT(*) AS v_exam_count,
            AVG(CASE WHEN a.total_marks > 0 THEN (a.score / a.total_marks) * 100 ELSE NULL END) AS v_avg_score_pct,
            AVG(
                CASE WHEN a.time_taken_seconds > 0 AND (
                    SELECT COUNT(*) FROM public.exam_questions eq WHERE eq.exam_id = a.exam_id
                ) > 0
                THEN a.time_taken_seconds::numeric / (SELECT COUNT(*) FROM public.exam_questions eq WHERE eq.exam_id = a.exam_id)
                ELSE NULL END
            ) AS v_avg_seconds_per_question,
            COUNT(DISTINCT date_trunc('day', COALESCE(a.submitted_at, a.created_at))) AS v_exam_active_days
        FROM public.exam_attempts a
        WHERE COALESCE(a.submitted_at, a.created_at) >= v_period_start
        GROUP BY a.profile_id
    ),
    class_stats AS (
        SELECT
            cws.profile_id,
            SUM(cws.watched_seconds) AS v_class_watch_seconds,
            COUNT(DISTINCT cws.watch_date) AS v_class_active_days
        FROM public.class_watch_sessions cws
        WHERE cws.watch_date >= v_period_start::date
        GROUP BY cws.profile_id
    ),
    focus_stats AS (
        SELECT
            fs.user_id AS profile_id,
            SUM(fs.duration_seconds) AS v_focus_seconds,
            COUNT(DISTINCT date_trunc('day', fs.started_at)) AS v_focus_active_days
        FROM public.focus_sessions fs
        WHERE fs.started_at >= v_period_start
        GROUP BY fs.user_id
    ),
    combined AS (
        SELECT
            eu.profile_id,
            COALESCE(es.v_exam_count, 0) AS v_exam_count,
            COALESCE(es.v_avg_score_pct, 0) AS v_avg_score_pct,
            es.v_avg_seconds_per_question,
            COALESCE(cs.v_class_watch_seconds, 0) AS v_class_watch_seconds,
            COALESCE(fst.v_focus_seconds, 0) AS v_focus_seconds,
            -- Regularity = distinct days with ANY tracked activity, across all
            -- three sources, capped at the period length itself.
            LEAST(
                GREATEST(COALESCE(es.v_exam_active_days, 0), COALESCE(cs.v_class_active_days, 0), COALESCE(fst.v_focus_active_days, 0)),
                GREATEST(p_days, 1)
            ) AS v_active_days
        FROM enrolled_users eu
        LEFT JOIN exam_stats es ON es.profile_id = eu.profile_id
        LEFT JOIN class_stats cs ON cs.profile_id = eu.profile_id
        LEFT JOIN focus_stats fst ON fst.profile_id = eu.profile_id
    ),
    -- Normalize each raw metric to a 0-100 scale relative to the best
    -- performer in this period, so scales differ (seconds vs count vs %)
    -- without any one metric mechanically dominating.
    bounds AS (
        SELECT
            GREATEST(MAX(v_exam_count), 1) AS max_exam_count,
            GREATEST(MAX(v_class_watch_seconds), 1) AS max_class_seconds,
            GREATEST(MAX(v_focus_seconds), 1) AS max_focus_seconds,
            GREATEST(MAX(v_active_days), 1) AS max_active_days
        FROM combined
    ),
    scored AS (
        SELECT
            c.*,
            -- log-scaled exam volume so one binge day doesn't dwarf steady practice
            (LN(c.v_exam_count + 1) / NULLIF(LN(b.max_exam_count + 1), 0)) * 100 AS exam_volume_norm,
            (c.v_class_watch_seconds::numeric / b.max_class_seconds) * 100 AS class_norm,
            (c.v_focus_seconds::numeric / b.max_focus_seconds) * 100 AS focus_norm,
            (c.v_active_days::numeric / b.max_active_days) * 100 AS regularity_norm
        FROM combined c CROSS JOIN bounds b
    ),
    final AS (
        SELECT
            s.profile_id,
            s.v_exam_count,
            ROUND(s.v_avg_score_pct::numeric, 2) AS v_avg_score_pct,
            ROUND(s.v_avg_seconds_per_question::numeric, 1) AS v_avg_seconds_per_question,
            s.v_class_watch_seconds,
            s.v_focus_seconds,
            s.v_active_days,
            ROUND(
                ((s.v_avg_score_pct * 0.40) +
                (COALESCE(s.exam_volume_norm, 0) * 0.20) +
                (COALESCE(s.regularity_norm, 0) * 0.15) +
                (COALESCE(s.focus_norm, 0) * 0.15) +
                (COALESCE(s.class_norm, 0) * 0.10))::numeric
            , 2) AS v_composite_score
        FROM scored s
    )
    SELECT
        f.profile_id,
        p.full_name,
        p.avatar_url,
        f.v_exam_count,
        f.v_avg_score_pct,
        f.v_avg_seconds_per_question,
        f.v_class_watch_seconds,
        f.v_focus_seconds,
        f.v_active_days,
        f.v_composite_score,
        RANK() OVER (
            ORDER BY f.v_composite_score DESC,
                     f.v_avg_seconds_per_question ASC NULLS LAST -- tie-break: faster-but-equally-accurate ranks higher
        ) AS rank_position
    FROM final f
    JOIN public.profiles p ON p.id = f.profile_id
    ORDER BY rank_position ASC, p.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_performers(integer) TO authenticated;

-- Detail RPC for "বিস্তারিত": per-user breakdown across the fixed set of
-- day-ranges (today, 3/7/15/30/45/60/75/90), each range's start/end date
-- included so the frontend can show "থেকে ... পর্যন্ত" alongside the numbers,
-- plus a category-wise daily activity series (for the requested graph) for
-- the widest range (90 days) so one query covers the whole graph.
CREATE OR REPLACE FUNCTION public.get_my_performance_detail()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_ranges int[] := ARRAY[0, 3, 7, 15, 30, 45, 60, 75, 90];
    v_range int;
    v_period_start timestamptz;
    v_period_end timestamptz := now();
    v_summaries jsonb := '[]'::jsonb;
    v_daily jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('summaries', '[]'::jsonb, 'daily_activity', '[]'::jsonb);
    END IF;

    FOREACH v_range IN ARRAY v_ranges LOOP
        v_period_start := CASE WHEN v_range <= 0 THEN date_trunc('day', now()) ELSE now() - (v_range || ' days')::interval END;

        v_summaries := v_summaries || jsonb_build_object(
            'days', v_range,
            'period_start', v_period_start,
            'period_end', v_period_end,
            'exam_count', (
                SELECT COUNT(*) FROM public.exam_attempts a
                WHERE a.profile_id = v_user_id AND COALESCE(a.submitted_at, a.created_at) >= v_period_start
            ),
            'avg_score_pct', (
                SELECT ROUND(AVG(CASE WHEN a.total_marks > 0 THEN (a.score / a.total_marks) * 100 ELSE NULL END), 2)
                FROM public.exam_attempts a
                WHERE a.profile_id = v_user_id AND COALESCE(a.submitted_at, a.created_at) >= v_period_start
            ),
            'class_watch_seconds', (
                SELECT COALESCE(SUM(watched_seconds), 0) FROM public.class_watch_sessions cws
                WHERE cws.profile_id = v_user_id AND cws.watch_date >= v_period_start::date
            ),
            'focus_seconds', (
                SELECT COALESCE(SUM(duration_seconds), 0) FROM public.focus_sessions fs
                WHERE fs.user_id = v_user_id AND fs.started_at >= v_period_start
            ),
            'active_days', (
                SELECT COUNT(DISTINCT d) FROM (
                    SELECT date_trunc('day', COALESCE(a.submitted_at, a.created_at)) AS d
                    FROM public.exam_attempts a WHERE a.profile_id = v_user_id AND COALESCE(a.submitted_at, a.created_at) >= v_period_start
                    UNION
                    SELECT cws.watch_date::timestamptz AS d
                    FROM public.class_watch_sessions cws WHERE cws.profile_id = v_user_id AND cws.watch_date >= v_period_start::date
                    UNION
                    SELECT date_trunc('day', fs.started_at) AS d
                    FROM public.focus_sessions fs WHERE fs.user_id = v_user_id AND fs.started_at >= v_period_start
                ) x
            )
        );
    END LOOP;

    -- Daily activity series (last 90 days) split by category, for the graph.
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_daily
    FROM (
        SELECT
            d::date AS date,
            COALESCE((SELECT COUNT(*) FROM public.exam_attempts a WHERE a.profile_id = v_user_id AND date_trunc('day', COALESCE(a.submitted_at, a.created_at)) = d), 0) AS exams,
            COALESCE((SELECT SUM(watched_seconds) FROM public.class_watch_sessions cws WHERE cws.profile_id = v_user_id AND cws.watch_date = d::date), 0) AS class_seconds,
            COALESCE((SELECT SUM(duration_seconds) FROM public.focus_sessions fs WHERE fs.user_id = v_user_id AND date_trunc('day', fs.started_at) = d), 0) AS focus_seconds
        FROM generate_series(date_trunc('day', now() - interval '90 days'), date_trunc('day', now()), interval '1 day') AS d
    ) t;

    RETURN jsonb_build_object('summaries', v_summaries, 'daily_activity', v_daily);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_performance_detail() TO authenticated;


-- ===== 20260802000000_telegram_live_exam_notify.sql =====
-- Telegram notification on Live Exam start
-- 1) New columns on exams table
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS telegram_notify_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_message text,
  ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;

-- 2) Enable required extensions (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 3) App settings for bot token/channel (uses existing app_settings key/value pattern)
INSERT INTO public.app_settings (key, value)
VALUES
  ('telegram_bot_token', '"8812827959:AAGqowefvhmg-kAn5Gs6vc0IlMxMp23UGnU"'),
  ('telegram_channel_id', '"-1003634195330"')
ON CONFLICT (key) DO NOTHING;

-- 4) Function: check for exams that just went live and send Telegram message
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  bot_token text;
  channel_id text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT value #>> '{}' INTO channel_id FROM public.app_settings WHERE key = 'telegram_channel_id';
  SELECT COALESCE(value #>> '{}', 'https://beshijoss.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL OR channel_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
  LOOP
    exam_link := site_url || '/dashboard/take-exam/' || r.id;
    duration_txt := COALESCE(r.duration_minutes::text || ' মিনিট', 'N/A');

    msg := '📌 <b>Exam Name:</b> ' || r.title || E'\n\n'
      || '⚡ <b>Start:</b> ' || to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
      || COALESCE('🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n', '')
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || COALESCE(r.telegram_message || E'\n\n', '')
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    PERFORM extensions.net_http_post(
      url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', channel_id,
        'text', msg,
        'parse_mode', 'HTML'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;

-- 5) Schedule cron job every minute
SELECT cron.schedule(
  'notify-live-exams-telegram',
  '* * * * *',
  $$SELECT public.notify_live_exams_telegram();$$
);


-- ===== 20260802010000_telegram_message_format_update.sql =====
-- Telegram notification on Live Exam start
-- 1) New columns on exams table
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS telegram_notify_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_message text,
  ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;

-- 2) Enable required extensions (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 3) App settings for bot token/channel (uses existing app_settings key/value pattern)
INSERT INTO public.app_settings (key, value)
VALUES
  ('telegram_bot_token', '"8812827959:AAGqowefvhmg-kAn5Gs6vc0IlMxMp23UGnU"'),
  ('telegram_channel_id', '"-1003634195330"')
ON CONFLICT (key) DO NOTHING;

-- 4) Function: check for exams that just went live and send Telegram message
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  bot_token text;
  channel_id text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
  request_id bigint;
  short_link text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT value #>> '{}' INTO channel_id FROM public.app_settings WHERE key = 'telegram_channel_id';
  SELECT COALESCE(value #>> '{}', 'https://atlascourses.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL OR channel_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
  LOOP
    exam_link := site_url || '/open-exam/' || r.id;

    BEGIN
      SELECT (extensions.net_http_get(
        url := 'https://tinyurl.com/api-create.php?url=' || exam_link
      )).* INTO request_id;

      -- wait briefly for pg_net async response
      PERFORM pg_sleep(1.5);

      SELECT content INTO short_link
      FROM net._http_response
      WHERE id = request_id;

      IF short_link IS NOT NULL AND short_link LIKE 'http%' THEN
        exam_link := short_link;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- keep long link on any failure
    END;
    duration_txt := COALESCE(r.duration_minutes::text || ' মিনিট', 'N/A');

    msg := '📌 <b>Exam Name:</b> ' || r.title || E'\n\n'
      || '⚡ <b>Start:</b> ' || to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
      || COALESCE('🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n', '')
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || COALESCE(r.telegram_message || E'\n\n', '')
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    PERFORM extensions.net_http_post(
      url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', channel_id,
        'text', msg,
        'parse_mode', 'HTML'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;

-- 5) Schedule cron job every minute
SELECT cron.schedule(
  'notify-live-exams-telegram',
  '* * * * *',
  $$SELECT public.notify_live_exams_telegram();$$
);


-- ===== 20260802020000_telegram_multi_channel.sql =====
-- Multi-channel Telegram support
CREATE TABLE IF NOT EXISTS public.telegram_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  chat_id text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage telegram_channels" ON public.telegram_channels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed existing channel from previous single-channel setup
INSERT INTO public.telegram_channels (name, chat_id, is_active)
VALUES ('Main Channel', '-1003634195330', true)
ON CONFLICT (chat_id) DO NOTHING;

-- Exam now targets multiple channel IDs (array of telegram_channels.id)
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS telegram_channel_ids uuid[] DEFAULT '{}';

-- Updated function: loop over selected active channels
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ch RECORD;
  bot_token text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
  request_id bigint;
  short_link text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT COALESCE(value #>> '{}', 'https://atlascourses.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end, telegram_channel_ids
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
      AND telegram_channel_ids IS NOT NULL
      AND array_length(telegram_channel_ids, 1) > 0
  LOOP
    exam_link := site_url || '/open-exam/' || r.id;

    BEGIN
      SELECT (extensions.net_http_get(
        url := 'https://tinyurl.com/api-create.php?url=' || exam_link
      )).* INTO request_id;

      PERFORM pg_sleep(1.5);

      SELECT content INTO short_link
      FROM net._http_response
      WHERE id = request_id;

      IF short_link IS NOT NULL AND short_link LIKE 'http%' THEN
        exam_link := short_link;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    duration_txt := COALESCE(r.duration_minutes::text || ' মিনিট', 'N/A');

    msg := '📌 <b>Exam Name:</b> ' || r.title || E'\n\n'
      || '⚡ <b>Start:</b> ' || to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
      || COALESCE('🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n', '')
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || COALESCE(r.telegram_message || E'\n\n', '')
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    FOR ch IN
      SELECT chat_id FROM public.telegram_channels
      WHERE id = ANY(r.telegram_channel_ids) AND is_active = true
    LOOP
      PERFORM extensions.net_http_post(
        url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', ch.chat_id,
          'text', msg,
          'parse_mode', 'HTML'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    END LOOP;

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;


-- ===== 20260802030000_fix_pg_net_function_names.sql =====
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ch RECORD;
  bot_token text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
  request_id bigint;
  short_link text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT COALESCE(value #>> '{}', 'https://atlascourses.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end, telegram_channel_ids
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
      AND telegram_channel_ids IS NOT NULL
      AND array_length(telegram_channel_ids, 1) > 0
  LOOP
    exam_link := site_url || '/open-exam/' || r.id;

    BEGIN
      SELECT net.http_get(
        url := 'https://tinyurl.com/api-create.php?url=' || exam_link
      ) INTO request_id;

      PERFORM pg_sleep(1.5);

      SELECT content INTO short_link
      FROM net._http_response
      WHERE id = request_id;

      IF short_link IS NOT NULL AND short_link LIKE 'http%' THEN
        exam_link := short_link;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    duration_txt := COALESCE(r.duration_minutes::text || ' মিনিট', 'N/A');

    msg := '📌 <b>Exam Name:</b> ' || r.title || E'\n\n'
      || '⚡ <b>Start:</b> ' || to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
      || COALESCE('🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n', '')
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || COALESCE(r.telegram_message || E'\n\n', '')
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    FOR ch IN
      SELECT chat_id FROM public.telegram_channels
      WHERE id = ANY(r.telegram_channel_ids) AND is_active = true
    LOOP
      PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', ch.chat_id,
          'text', msg,
          'parse_mode', 'HTML'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    END LOOP;

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;


-- ===== 20260802040000_fix_null_message_bug.sql =====
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ch RECORD;
  bot_token text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
  request_id bigint;
  short_link text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT COALESCE(value #>> '{}', 'https://atlascourses.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end, telegram_channel_ids
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
      AND telegram_channel_ids IS NOT NULL
      AND array_length(telegram_channel_ids, 1) > 0
  LOOP
    -- Always start with the safe long link
    exam_link := site_url || '/open-exam/' || r.id::text;
    short_link := NULL;

    BEGIN
      SELECT net.http_get(
        url := 'https://tinyurl.com/api-create.php?url=' || exam_link
      ) INTO request_id;

      PERFORM pg_sleep(1.5);

      SELECT content INTO short_link
      FROM net._http_response
      WHERE id = request_id;

      IF short_link IS NOT NULL AND short_link LIKE 'http%' THEN
        exam_link := short_link;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- keep long link, exam_link already set above
    END;

    -- Safety net: never let exam_link end up NULL
    IF exam_link IS NULL THEN
      exam_link := site_url || '/open-exam/' || r.id::text;
    END IF;

    duration_txt := COALESCE(r.duration_minutes::text, '0') || ' মিনিট';

    msg := '📌 <b>Exam Name:</b> ' || COALESCE(r.title, '') || E'\n\n'
      || '⚡ <b>Start:</b> ' || COALESCE(to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM'), '') || E'\n'
      || CASE WHEN r.time_window_end IS NOT NULL
              THEN '🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
              ELSE ''
         END
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || CASE WHEN r.telegram_message IS NOT NULL AND r.telegram_message <> ''
              THEN r.telegram_message || E'\n\n'
              ELSE ''
         END
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    FOR ch IN
      SELECT chat_id FROM public.telegram_channels
      WHERE id = ANY(r.telegram_channel_ids) AND is_active = true
    LOOP
      PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', ch.chat_id,
          'text', msg,
          'parse_mode', 'HTML'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    END LOOP;

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;


-- ===== 20260802050000_remove_shortener_use_direct_link.sql =====
CREATE OR REPLACE FUNCTION public.notify_live_exams_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ch RECORD;
  bot_token text;
  site_url text;
  msg text;
  exam_link text;
  duration_txt text;
BEGIN
  SELECT value #>> '{}' INTO bot_token FROM public.app_settings WHERE key = 'telegram_bot_token';
  SELECT COALESCE(value #>> '{}', 'https://atlascourses.com') INTO site_url FROM public.app_settings WHERE key = 'site_url';

  IF bot_token IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, title, telegram_message, duration_minutes, time_window_start, time_window_end, telegram_channel_ids
    FROM public.exams
    WHERE exam_type = 'live'
      AND is_published = true
      AND telegram_notify_enabled = true
      AND telegram_notified_at IS NULL
      AND time_window_start IS NOT NULL
      AND time_window_start <= now()
      AND (time_window_end IS NULL OR time_window_end > now())
      AND telegram_channel_ids IS NOT NULL
      AND array_length(telegram_channel_ids, 1) > 0
  LOOP
    exam_link := site_url || '/open-exam/' || r.id::text;
    duration_txt := COALESCE(r.duration_minutes::text, '0') || ' মিনিট';

    msg := '📌 <b>Exam Name:</b> ' || COALESCE(r.title, '') || E'\n\n'
      || '⚡ <b>Start:</b> ' || COALESCE(to_char(r.time_window_start AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM'), '') || E'\n'
      || CASE WHEN r.time_window_end IS NOT NULL
              THEN '🏁 <b>End:</b> ' || to_char(r.time_window_end AT TIME ZONE 'Asia/Dhaka', 'DD Mon, HH12:MI AM') || E'\n'
              ELSE ''
         END
      || '⏱ <b>Duration:</b> ' || duration_txt || E'\n\n'
      || CASE WHEN r.telegram_message IS NOT NULL AND r.telegram_message <> ''
              THEN r.telegram_message || E'\n\n'
              ELSE ''
         END
      || '🔗 <b>Exam Link:</b> ' || exam_link;

    FOR ch IN
      SELECT chat_id FROM public.telegram_channels
      WHERE id = ANY(r.telegram_channel_ids) AND is_active = true
    LOOP
      PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', ch.chat_id,
          'text', msg,
          'parse_mode', 'HTML'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    END LOOP;

    UPDATE public.exams SET telegram_notified_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_live_exams_telegram() TO service_role;


-- ===== 20260803120000_readymade_mcq_counts_add_boards.sql =====
-- Extend get_readymade_mcq_counts to also return board/category-level MCQ
-- counts (keyed "chapter||readymade_category"), so the Board/Category cards
-- on the Readymade Exam page can show an MCQ badge like Chapter/Sub-chapter
-- cards already do.

CREATE OR REPLACE FUNCTION public.get_readymade_mcq_counts(
    p_readymade_topics text[] DEFAULT NULL,
    p_readymade_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_subject_counts jsonb;
    v_chapter_counts jsonb;
    v_board_counts jsonb;
    v_subchapter_counts jsonb;
BEGIN
    WITH filtered_exams AS (
        SELECT e.id, e.subject, e.chapter, e.readymade_category, e.readymade_sub_chapter
        FROM public.exams e
        WHERE e.is_readymade = true
          AND e.is_published = true
          AND (p_readymade_topics IS NULL OR array_length(p_readymade_topics, 1) IS NULL OR e.readymade_topic = ANY(p_readymade_topics))
          AND (p_readymade_categories IS NULL OR array_length(p_readymade_categories, 1) IS NULL OR e.readymade_category = ANY(p_readymade_categories))
    ),
    exam_qcounts AS (
        SELECT fe.id AS exam_id, fe.subject, fe.chapter, fe.readymade_category, fe.readymade_sub_chapter, COUNT(eq.id) AS qcount
        FROM filtered_exams fe
        LEFT JOIN public.exam_questions eq ON eq.exam_id = fe.id
        GROUP BY fe.id, fe.subject, fe.chapter, fe.readymade_category, fe.readymade_sub_chapter
    ),
    subject_totals AS (
        SELECT s AS subject_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq, unnest(eq.subject) AS s
        GROUP BY s
    ),
    chapter_totals AS (
        SELECT eq.chapter AS chapter_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.chapter IS NOT NULL
        GROUP BY eq.chapter
    ),
    board_totals AS (
        SELECT eq.chapter || '||' || eq.readymade_category AS key_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.chapter IS NOT NULL AND eq.readymade_category IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_category
    ),
    subchapter_totals AS (
        SELECT eq.chapter || '||' || eq.readymade_sub_chapter AS key_name, SUM(eq.qcount) AS total
        FROM exam_qcounts eq
        WHERE eq.readymade_sub_chapter IS NOT NULL
        GROUP BY eq.chapter, eq.readymade_sub_chapter
    )
    SELECT
        (SELECT COALESCE(jsonb_object_agg(subject_name, total), '{}'::jsonb) FROM subject_totals),
        (SELECT COALESCE(jsonb_object_agg(chapter_name, total), '{}'::jsonb) FROM chapter_totals),
        (SELECT COALESCE(jsonb_object_agg(key_name, total), '{}'::jsonb) FROM board_totals),
        (SELECT COALESCE(jsonb_object_agg(key_name, total), '{}'::jsonb) FROM subchapter_totals)
    INTO v_subject_counts, v_chapter_counts, v_board_counts, v_subchapter_counts;

    RETURN jsonb_build_object(
        'subject_counts', v_subject_counts,
        'chapter_counts', v_chapter_counts,
        'board_counts', v_board_counts,
        'subchapter_counts', v_subchapter_counts
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_readymade_mcq_counts(text[], text[]) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';


-- ===== 20260805173215_telegram_support_cards_nested.sql =====
-- Dedicated tables for landing-page Telegram Support cards.
-- Each card is one row (e.g. "HSC 27"), and can contain multiple
-- topic/subtopic links inside it.

create table if not exists public.telegram_support_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_support_topics (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.telegram_support_cards(id) on delete cascade,
  title text not null,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.telegram_support_cards enable row level security;
alter table public.telegram_support_topics enable row level security;

-- Public can read (cards are shown on the public landing page + dashboard)
create policy "Public can view telegram support cards"
  on public.telegram_support_cards for select
  using (true);

create policy "Public can view telegram support topics"
  on public.telegram_support_topics for select
  using (true);

-- Only admins can insert/update/delete
create policy "Admins can manage telegram support cards"
  on public.telegram_support_cards for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage telegram support topics"
  on public.telegram_support_topics for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_telegram_support_topics_card_id
  on public.telegram_support_topics(card_id);


-- ===== 20260808000000_exclude_custom_from_routinewise_analytics.sql =====
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


-- ===== 20260810000000_custom_exam_subchapter_grants.sql =====
-- create_custom_exam was missing sub-chapter-level access grants
-- (course_readymade_access table), so users who only had sub-chapter grants
-- (not full course/shared/readymade enrollment) got "You are not enrolled
-- for exam %" even though the Readymade page showed the exam as unlocked.
-- Mirrors isExamUnlocked() in Readymade.tsx / CustomExamBuilder.tsx.

CREATE OR REPLACE FUNCTION public.create_custom_exam(
  p_exam_ids uuid[],
  p_counts integer[],
  p_title text DEFAULT 'Custom Exam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_exam_id uuid;
  v_source record;
  v_count int;
  v_total_marks numeric(10,2) := 0;
  v_question_index int := 0;
  v_is_unlocked boolean;
  v_is_admin boolean;
  v_chapter text;
  v_sub_chapter text;
  v_subject text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exam_ids IS NULL OR array_length(p_exam_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No exams selected';
  END IF;

  IF array_length(p_exam_ids, 1) <> array_length(p_counts, 1) THEN
    RAISE EXCEPTION 'Exam list and count list length mismatch';
  END IF;

  v_is_admin := public.is_admin();

  INSERT INTO public.exams (
    title, exam_type, duration_minutes, negative_mark_per_question,
    is_published, is_readymade, is_archive, is_archived, is_visible_on_free,
    subject, chapter, category
  ) VALUES (
    p_title, 'practice', 0, 0,
    true, false, false, false, true,
    '{}', 'Custom', '{"Custom Exam"}'
  ) RETURNING id INTO v_new_exam_id;

  FOR i IN 1 .. array_length(p_exam_ids, 1) LOOP
    v_count := p_counts[i];
    IF v_count IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source FROM public.exams WHERE id = p_exam_ids[i];
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source exam % not found', p_exam_ids[i];
    END IF;

    IF v_source.parent_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected exam % is a split section, not a main readymade exam. Please pick the main exam.', p_exam_ids[i];
    END IF;

    IF v_source.is_readymade IS NOT TRUE OR v_source.is_published IS NOT TRUE THEN
      RAISE EXCEPTION 'Source exam % is not a published readymade exam', p_exam_ids[i];
    END IF;

    v_is_unlocked := v_is_admin OR COALESCE(v_source.is_visible_on_free, false);

    IF NOT v_is_unlocked THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = v_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_source.course_id IS NOT NULL AND aac.course_id = v_source.course_id)
            OR
            (v_source.shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.shared_course_ids))
            OR
            (v_source.readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_source.readymade_course_ids))
      ) INTO v_is_unlocked;
    END IF;

    -- Sub-chapter-level grant fallback (course_readymade_access), mirrors
    -- the frontend's isExamUnlocked() sub-chapter check.
    IF NOT v_is_unlocked THEN
      v_chapter := COALESCE(v_source.chapter, 'সাধারণ');
      v_sub_chapter := COALESCE(v_source.readymade_sub_chapter, 'সাধারণ');

      SELECT EXISTS (
        WITH RECURSIVE all_accessible_courses AS (
            SELECT course_id
            FROM public.enrollments
            WHERE profile_id = v_user_id
              AND (expires_at IS NULL OR expires_at > now())
            UNION
            SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
            FROM all_accessible_courses aac
            JOIN public.courses c ON aac.course_id = c.id
            WHERE c.linked_course_ids IS NOT NULL
        )
        SELECT 1
        FROM public.course_readymade_access gr
        JOIN all_accessible_courses aac ON aac.course_id = gr.course_id
        WHERE gr.mode = 'readymade'
          AND gr.chapter = v_chapter
          AND gr.sub_chapter = v_sub_chapter
          AND gr.subject = ANY(
            CASE
              WHEN v_source.subject IS NULL THEN ARRAY[]::text[]
              ELSE v_source.subject
            END
          )
      ) INTO v_is_unlocked;
    END IF;

    IF NOT v_is_unlocked THEN
      RAISE EXCEPTION 'You are not enrolled for exam %', p_exam_ids[i];
    END IF;

    INSERT INTO public.exam_questions (
      exam_id, question_index, question_text,
      option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    )
    SELECT
      v_new_exam_id,
      v_question_index + row_number() OVER (),
      question_text, option_a, option_b, option_c, option_d,
      correct_option, marks, explanation, question_type, section
    FROM public.exam_questions
    WHERE exam_id = p_exam_ids[i]
    ORDER BY random()
    LIMIT v_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_question_index := v_question_index + v_count;
    v_total_marks := v_total_marks + v_count;
  END LOOP;

  IF v_question_index = 0 THEN
    DELETE FROM public.exams WHERE id = v_new_exam_id;
    RAISE EXCEPTION 'No questions could be pulled from the selected exams';
  END IF;

  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS new_idx
    FROM public.exam_questions WHERE exam_id = v_new_exam_id
  )
  UPDATE public.exam_questions eq
  SET question_index = s.new_idx
  FROM shuffled s
  WHERE eq.id = s.id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions WHERE exam_id = v_new_exam_id;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      duration_minutes = GREATEST(CEIL(v_question_index * 0.5)::int, 1)
  WHERE id = v_new_exam_id;

  RETURN v_new_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_exam(uuid[], integer[], text) TO authenticated;


-- ===== 20260810000000_special_exam_guest_access.sql =====
-- Special Exam type with subject-wise segments (mandatory/optional) + per-exam guest access toggle

-- 1) Allow "special" exam_type
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_exam_type_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_exam_type_check
    CHECK (exam_type = ANY (ARRAY['live'::text, 'practice'::text, 'special'::text]));

-- 2) Per-exam toggle: allow this exam to be taken without login (guest access),
--    independent of the free-exam listing (is_visible_on_free).
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS allow_guest boolean DEFAULT false NOT NULL;

-- 3) Subject-wise segments for Special Exam questions.
--    subject: which subject/segment this question belongs to (used only when exam_type = 'special').
--    is_segment_mandatory: whether this subject-segment is mandatory (always included) or
--    optional (student selects which optional subjects they want on the pre-exam screen).
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS is_segment_mandatory boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_subject ON public.exam_questions (exam_id, subject);

COMMENT ON COLUMN public.exams.allow_guest IS 'If true, this exam can be taken without login (guest access), regardless of exam_type.';
COMMENT ON COLUMN public.exam_questions.subject IS 'Subject/segment name for Special Exam (exam_type=special); null for live/practice exams.';
COMMENT ON COLUMN public.exam_questions.is_segment_mandatory IS 'For Special Exam: true = always included, false = student picks this subject as optional on pre-exam screen.';


-- ===== 20260810010000_allow_guest_rpc_support.sql =====
-- Extend guest-access RPCs so any exam with allow_guest = true works for
-- anonymous visitors exactly like is_visible_on_free exams do — same
-- get_exam_questions_start / submit_exam_attempt flow, just an additional
-- OR condition on the access check.

DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text, question_index integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_allow_guest boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
  v_parent_exam_id uuid;
  v_split_start integer;
  v_split_end integer;
  v_source_exam_id uuid;
BEGIN
  SELECT ex.course_id, ex.is_visible_on_free, COALESCE(ex.allow_guest, false), ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade,
         ex.parent_exam_id, ex.split_start, ex.split_end
  INTO v_exam_course_id, v_is_visible_on_free, v_allow_guest, v_shared_course_ids, v_readymade_course_ids, v_is_readymade,
       v_parent_exam_id, v_split_start, v_split_end
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  v_source_exam_id := COALESCE(v_parent_exam_id, p_exam_id);

  IF v_is_visible_on_free IS TRUE OR v_allow_guest IS TRUE THEN
      v_has_access := true;
  END IF;

  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
      ) INTO v_has_access;
  END IF;

  IF v_has_access THEN
      RETURN QUERY
      SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.option_e,
        q.question_index
      FROM public.exam_questions q
      WHERE q.exam_id = v_source_exam_id
        AND (v_parent_exam_id IS NULL OR q.question_index BETWEEN v_split_start AND v_split_end)
      ORDER BY q.question_index ASC;
  ELSE
      RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;

-- submit_exam_attempt: same signature, only the guest-eligibility check changes.
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

    IF NOT v_is_guest THEN
        SELECT count(*) + 1 INTO v_attempt_number
        FROM public.study_activity_logs
        WHERE user_id = v_user_id
        AND activity_type = 'exam'
        AND (metadata->>'exam_id')::UUID = p_exam_id;

        DELETE FROM public.exam_attempts
        WHERE exam_id = p_exam_id
        AND profile_id = v_user_id
        AND attempt_type = v_attempt_type;
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

    IF NOT v_is_guest THEN
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

    INSERT INTO public.exam_attempts (
        exam_id, profile_id, score, total_marks, started_at, submitted_at,
        violation_count, answers, time_taken_seconds, attempt_number, attempt_type,
        guest_name, guest_hsc_batch, guest_college_name, guest_phone
    )
    VALUES (
        p_exam_id, v_user_id, v_total_score, v_total_score, now(), now(),
        p_violation_count, p_answers, p_time_taken_seconds, v_attempt_number, v_attempt_type,
        CASE WHEN v_is_guest THEN p_guest_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_hsc_batch ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_college_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_phone ELSE NULL END
    )
    RETURNING id INTO v_attempt_id;

    IF NOT v_is_guest THEN
        INSERT INTO public.study_activity_logs (user_id, activity_type, duration_seconds, metadata)
        VALUES (
            v_user_id, 'exam', p_time_taken_seconds,
            jsonb_build_object(
                'exam_id', p_exam_id, 'attempt_id', v_attempt_id, 'score', v_total_score,
                'raw_score', v_raw_score, 'deduction', v_deduction, 'attempt_number', v_attempt_number,
                'attempt_type', v_attempt_type, 'is_second_timer', v_is_second_timer, 'question_count', v_question_count
            )
        );
    END IF;

    RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20260810020000_exam_questions_start_add_subject.sql =====
-- Return subject + is_segment_mandatory from get_exam_questions_start so the
-- frontend can build the Special Exam pre-exam subject-selection screen and
-- filter questions by the student's chosen optional subjects.

DROP FUNCTION IF EXISTS public.get_exam_questions_start(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_exam_questions_start(p_exam_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, option_e text,
  question_index integer, subject text, is_segment_mandatory boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_exam_course_id uuid;
  v_is_visible_on_free boolean;
  v_allow_guest boolean;
  v_shared_course_ids uuid[];
  v_readymade_course_ids uuid[];
  v_is_readymade boolean;
  v_has_access boolean := false;
  v_parent_exam_id uuid;
  v_split_start integer;
  v_split_end integer;
  v_source_exam_id uuid;
BEGIN
  SELECT ex.course_id, ex.is_visible_on_free, COALESCE(ex.allow_guest, false), ex.shared_course_ids, ex.readymade_course_ids, ex.is_readymade,
         ex.parent_exam_id, ex.split_start, ex.split_end
  INTO v_exam_course_id, v_is_visible_on_free, v_allow_guest, v_shared_course_ids, v_readymade_course_ids, v_is_readymade,
       v_parent_exam_id, v_split_start, v_split_end
  FROM public.exams ex
  WHERE ex.id = p_exam_id;

  v_source_exam_id := COALESCE(v_parent_exam_id, p_exam_id);

  IF v_is_visible_on_free IS TRUE OR v_allow_guest IS TRUE THEN
      v_has_access := true;
  END IF;

  IF NOT v_has_access THEN
      WITH RECURSIVE all_accessible_courses AS (
          SELECT course_id
          FROM public.enrollments
          WHERE profile_id = p_user_id
            AND (expires_at IS NULL OR expires_at > now())

          UNION

          SELECT (unnest(COALESCE(c.linked_course_ids, '{}')))::uuid
          FROM all_accessible_courses aac
          JOIN public.courses c ON aac.course_id = c.id
          WHERE c.linked_course_ids IS NOT NULL
      )
      SELECT EXISTS (
          SELECT 1 FROM all_accessible_courses aac
          WHERE
            (v_exam_course_id IS NOT NULL AND aac.course_id = v_exam_course_id)
            OR
            (v_shared_course_ids IS NOT NULL AND aac.course_id = ANY(v_shared_course_ids))
            OR
            (v_is_readymade IS TRUE AND v_readymade_course_ids IS NOT NULL AND aac.course_id = ANY(v_readymade_course_ids))
      ) INTO v_has_access;
  END IF;

  IF v_has_access THEN
      RETURN QUERY
      SELECT
        q.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.option_e,
        q.question_index,
        q.subject,
        COALESCE(q.is_segment_mandatory, true)
      FROM public.exam_questions q
      WHERE q.exam_id = v_source_exam_id
        AND (v_parent_exam_id IS NULL OR q.question_index BETWEEN v_split_start AND v_split_end)
      ORDER BY q.question_index ASC;
  ELSE
      RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_start(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20260810030000_archive_full_access_toggle.sql =====
-- Course-level "All Archive Classes" toggle, mirroring readymade_full_access.
-- When true, students enrolled in this course get access to every archive
-- class (including future ones), without needing per-chapter grants in
-- course_readymade_access (mode='archive-class').
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS archive_full_access boolean DEFAULT false;

COMMENT ON COLUMN public.courses.archive_full_access IS 'If true, students enrolled in this course have access to all Archive Classes (including future ones), bypassing per-chapter course_readymade_access grants.';


-- ===== 20260810030000_staff_select_exams_fix.sql =====
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


-- ===== 20260810040000_report_images.sql =====
-- Allow students to attach an image when reporting a question mistake.

-- 1. Add image_url column to question_reports (nullable, safe additive change)
alter table public.question_reports
  add column if not exists image_url text;

-- 2. Create a public storage bucket for report images
insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id) do nothing;

-- 3. Storage RLS policies: any authenticated user can upload into their own
--    folder (named with their user id), anyone can read (bucket is public).
drop policy if exists "Report images are publicly accessible" on storage.objects;
create policy "Report images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'report-images');

drop policy if exists "Users can upload their own report images" on storage.objects;
create policy "Users can upload their own report images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own report images" on storage.objects;
create policy "Users can delete their own report images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';


-- ===== 20260810050000_class_comments.sql =====
-- Comment system for classes: students can comment on a class (recorded/live),
-- and reply to each other's comments (single-level replies). Admin can moderate.

create table if not exists public.class_comments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.class_comments(id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_class_comments_class_id on public.class_comments(class_id);
create index if not exists idx_class_comments_parent_id on public.class_comments(parent_id);

alter table public.class_comments enable row level security;

-- Anyone who can view the class (enrolled student, staff) can read comments.
-- We keep this simple: any authenticated user can read (matches app's general
-- pattern of gating access at the page/data level rather than duplicating
-- enrollment checks in every related table).
drop policy if exists "Authenticated users can view class comments" on public.class_comments;
create policy "Authenticated users can view class comments"
  on public.class_comments for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own comments" on public.class_comments;
create policy "Users can insert their own comments"
  on public.class_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own comments" on public.class_comments;
create policy "Users can delete their own comments"
  on public.class_comments for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Staff can delete any comment" on public.class_comments;
create policy "Staff can delete any comment"
  on public.class_comments for delete
  to authenticated
  using (public.is_staff());

NOTIFY pgrst, 'reload schema';

-- Enable Realtime so live-chat style comments push instantly to all viewers
alter publication supabase_realtime add table public.class_comments;


-- ===== 20260810060000_report_history.sql =====
-- Stop deleting reports on resolve/decline; mark status + store admin feedback instead,
-- so students (and admins) can always see the full history later, not just a one-time
-- notification. The 'status' column already existed but was unused (code always deleted).

alter table public.question_reports
  add column if not exists admin_feedback text;

alter table public.question_reports
  add column if not exists resolved_at timestamptz;

-- Broaden the allowed status values to match what the app actually uses.
alter table public.question_reports
  drop constraint if exists question_reports_status_check;

alter table public.question_reports
  add constraint question_reports_status_check
  check (status in ('pending', 'resolved', 'declined', 'ignored'));

NOTIFY pgrst, 'reload schema';


-- ===== 20260810070000_report_update_policy.sql =====
-- Bug: admin resolve/decline never actually persisted because there was no
-- UPDATE policy on question_reports. RLS silently blocked the update (0 rows
-- affected, no error thrown), so status stayed 'pending' forever and the
-- report never left the admin's pending list.

create policy "Admins can update reports"
  on public.question_reports for update
  using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  )
  with check (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  );

NOTIFY pgrst, 'reload schema';


-- ===== 20260812000000_second_timer_deduction_3percent.sql =====
-- Change 2nd Timer deduction from tiered fixed marks (1 / 1.5 / 3 based on
-- question count) to a flat 3% cut of the exam's TOTAL MCQ marks (not raw
-- score), for every exam.
-- Applies to: submit_exam_attempt (guest-aware version), recalculate_exam_results,
-- recalculate_exam_attempts_for_exam.

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

    IF NOT v_is_guest THEN
        SELECT count(*) + 1 INTO v_attempt_number
        FROM public.study_activity_logs
        WHERE user_id = v_user_id
        AND activity_type = 'exam'
        AND (metadata->>'exam_id')::UUID = p_exam_id;

        DELETE FROM public.exam_attempts
        WHERE exam_id = p_exam_id
        AND profile_id = v_user_id
        AND attempt_type = v_attempt_type;
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

    IF NOT v_is_guest THEN
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_user_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            -- Flat 3% deduction of the exam's total marks
            v_deduction := v_exam_total_marks * 0.03;
        END IF;
    END IF;

    v_total_score := v_raw_score - v_deduction;

    INSERT INTO public.exam_attempts (
        exam_id, profile_id, score, total_marks, started_at, submitted_at,
        violation_count, answers, time_taken_seconds, attempt_number, attempt_type,
        guest_name, guest_hsc_batch, guest_college_name, guest_phone
    )
    VALUES (
        p_exam_id, v_user_id, v_total_score, v_total_score, now(), now(),
        p_violation_count, p_answers, p_time_taken_seconds, v_attempt_number, v_attempt_type,
        CASE WHEN v_is_guest THEN p_guest_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_hsc_batch ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_college_name ELSE NULL END,
        CASE WHEN v_is_guest THEN p_guest_phone ELSE NULL END
    )
    RETURNING id INTO v_attempt_id;

    IF NOT v_is_guest THEN
        INSERT INTO public.study_activity_logs (user_id, activity_type, duration_seconds, metadata)
        VALUES (
            v_user_id, 'exam', p_time_taken_seconds,
            jsonb_build_object(
                'exam_id', p_exam_id, 'attempt_id', v_attempt_id, 'score', v_total_score,
                'raw_score', v_raw_score, 'deduction', v_deduction, 'attempt_number', v_attempt_number,
                'attempt_type', v_attempt_type, 'is_second_timer', v_is_second_timer
            )
        );
    END IF;

    RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer, integer, text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.recalculate_exam_results(p_exam_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_attempt record;
    v_answer record;
    v_raw_score NUMERIC := 0;
    v_negative_mark NUMERIC;
    v_is_second_timer BOOLEAN;
    v_question_marks NUMERIC;
    v_correct_option TEXT;
    v_deduction NUMERIC := 0;
    v_exam_total_marks NUMERIC;
    v_disable_second_timer_deduction BOOLEAN := false;
BEGIN
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(disable_second_timer_deduction, false), COALESCE(total_marks, 0)
    INTO v_negative_mark, v_disable_second_timer_deduction, v_exam_total_marks
    FROM public.exams
    WHERE id = p_exam_id;

    FOR v_attempt IN SELECT id, profile_id, answers FROM public.exam_attempts WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;
        v_deduction := 0;

        FOR v_answer IN SELECT * FROM jsonb_to_recordset(v_attempt.answers) AS x(question_id UUID, selected_option TEXT)
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

        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer AND NOT v_disable_second_timer_deduction THEN
            v_deduction := v_exam_total_marks * 0.03;
        END IF;

        UPDATE public.exam_attempts
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_exam_results(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.recalculate_exam_attempts_for_exam(p_exam_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_negative_mark NUMERIC;
    v_attempt RECORD;
    v_answer RECORD;
    v_correct_option TEXT;
    v_question_marks NUMERIC;
    v_raw_score NUMERIC;
    v_deduction NUMERIC;
    v_is_second_timer BOOLEAN;
    v_exam_total_marks NUMERIC;
    v_updated_count INTEGER := 0;
BEGIN
    SELECT COALESCE(negative_mark_per_question, 0), COALESCE(total_marks, 0) INTO v_negative_mark, v_exam_total_marks
    FROM public.exams
    WHERE id = p_exam_id;

    FOR v_attempt IN
        SELECT id, profile_id, answers
        FROM public.exam_attempts
        WHERE exam_id = p_exam_id
    LOOP
        v_raw_score := 0;

        FOR v_answer IN
            SELECT * FROM jsonb_to_recordset(v_attempt.answers) AS x(question_id UUID, selected_option TEXT)
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

        v_deduction := 0;
        SELECT COALESCE(is_second_timer, false) INTO v_is_second_timer
        FROM public.profiles
        WHERE id = v_attempt.profile_id;

        IF v_is_second_timer THEN
            v_deduction := v_exam_total_marks * 0.03;
        END IF;

        UPDATE public.exam_attempts
        SET score = v_raw_score - v_deduction,
            total_marks = v_raw_score - v_deduction
        WHERE id = v_attempt.id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN v_updated_count;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ===== 20260814000000_push_subscriptions.sql =====
-- Web Push subscriptions: stores browser push endpoints per logged-in user
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own subscription"
    ON public.push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscription"
    ON public.push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscription"
    ON public.push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON public.push_subscriptions(user_id);


