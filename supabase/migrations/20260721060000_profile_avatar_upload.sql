-- Profile avatar upload: adds avatar_url column, a public storage bucket for avatars,
-- RLS policies so users can only manage their own avatar file, and updates
-- focus_live_now() to also return avatar_url so Focus Timer's live list can show it.

-- 1. Add avatar_url column to profiles (nullable, safe additive change)
alter table public.profiles
  add column if not exists avatar_url text;

-- 2. Create a public storage bucket for avatars (public read, so images can be displayed
--    directly via their public URL; writes are restricted by policies below)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3. Storage RLS policies: users can only upload/update/delete a file
--    named exactly with their own user id as the filename (e.g. "<user_id>.jpg"),
--    inside the "avatars" bucket. Anyone can read (bucket is public).
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Update focus_live_now() to also return avatar_url
-- (must drop first since the return type/columns are changing)
drop function if exists public.focus_live_now();

create or replace function public.focus_live_now()
returns table(
  user_id uuid, full_name text, hsc_batch text,
  mood text, duration_seconds int, is_paused boolean, started_at timestamptz,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select fs.user_id, p.full_name, p.hsc_batch, fs.mood, fs.duration_seconds, fs.is_paused, fs.started_at, p.avatar_url
  from public.focus_sessions fs
  join public.profiles p on p.id = fs.user_id
  where fs.status = 'active'
  order by fs.duration_seconds desc
  limit 200;
$$;

grant execute on function public.focus_live_now() to authenticated, anon;
