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
