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
