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
