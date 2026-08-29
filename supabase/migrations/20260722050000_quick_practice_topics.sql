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
