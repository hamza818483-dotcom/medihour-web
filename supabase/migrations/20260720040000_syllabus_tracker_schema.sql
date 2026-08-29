-- Syllabus Tracker: simple content list managed from admin panel, shown on public page

create table if not exists public.syllabus_tracker_items (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  subject text,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.syllabus_tracker_items enable row level security;

create policy "syllabus_tracker_select_all" on public.syllabus_tracker_items
  for select using (true);

create policy "syllabus_tracker_admin_write" on public.syllabus_tracker_items for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'teacher'));
