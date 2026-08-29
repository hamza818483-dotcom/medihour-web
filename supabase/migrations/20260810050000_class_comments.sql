-- Comment system for classes: students can comment on a class (recorded/live),
-- and reply to each other's comments (single-level replies). Admin can moderate.

create table if not exists public.class_comments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.class_comments(id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_class_comments_class_id on public.class_comments(class_id);
create index if not exists idx_class_comments_parent_id on public.class_comments(parent_id);

alter table public.class_comments enable row level security;

-- Anyone who can view the class (enrolled student, staff) can read comments.
-- We keep this simple: any authenticated user can read (matches app's general
-- pattern of gating access at the page/data level rather than duplicating
-- enrollment checks in every related table).
drop policy if exists "Authenticated users can view class comments" on public.class_comments;
create policy "Authenticated users can view class comments"
  on public.class_comments for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own comments" on public.class_comments;
create policy "Users can insert their own comments"
  on public.class_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own comments" on public.class_comments;
create policy "Users can delete their own comments"
  on public.class_comments for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Staff can delete any comment" on public.class_comments;
create policy "Staff can delete any comment"
  on public.class_comments for delete
  to authenticated
  using (public.is_staff());

NOTIFY pgrst, 'reload schema';

-- Enable Realtime so live-chat style comments push instantly to all viewers
alter publication supabase_realtime add table public.class_comments;
