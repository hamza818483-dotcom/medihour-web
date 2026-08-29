alter table public.qp_attempts
  add column if not exists question_ids bigint[];
-- question_ids: ordered list of qp_mcqs.id used in this attempt, enabling exact "Practice Again" replay
