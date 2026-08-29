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
