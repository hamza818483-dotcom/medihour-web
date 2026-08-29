-- Allow students to attach an image when reporting a question mistake.

-- 1. Add image_url column to question_reports (nullable, safe additive change)
alter table public.question_reports
  add column if not exists image_url text;

-- 2. Create a public storage bucket for report images
insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id) do nothing;

-- 3. Storage RLS policies: any authenticated user can upload into their own
--    folder (named with their user id), anyone can read (bucket is public).
drop policy if exists "Report images are publicly accessible" on storage.objects;
create policy "Report images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'report-images');

drop policy if exists "Users can upload their own report images" on storage.objects;
create policy "Users can upload their own report images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own report images" on storage.objects;
create policy "Users can delete their own report images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
