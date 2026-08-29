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
