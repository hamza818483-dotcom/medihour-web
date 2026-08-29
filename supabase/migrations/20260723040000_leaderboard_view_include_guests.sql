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
