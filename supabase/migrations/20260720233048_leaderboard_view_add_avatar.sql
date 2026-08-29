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
