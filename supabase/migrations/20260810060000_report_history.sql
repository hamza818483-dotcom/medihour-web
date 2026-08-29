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
