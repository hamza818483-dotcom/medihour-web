-- Public bucket for class notes (PDF / image-merged PDF). Staff upload, anyone reads.
insert into storage.buckets (id, name, public)
values ('class-notes', 'class-notes', true)
on conflict (id) do nothing;

drop policy if exists "Class notes are publicly readable" on storage.objects;
create policy "Class notes are publicly readable"
  on storage.objects for select
  using (bucket_id = 'class-notes');

drop policy if exists "Staff can upload class notes" on storage.objects;
create policy "Staff can upload class notes"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'class-notes'
    and (public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'teacher'::public.app_role))
  );

drop policy if exists "Staff can delete class notes" on storage.objects;
create policy "Staff can delete class notes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'class-notes'
    and (public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'teacher'::public.app_role))
  );

NOTIFY pgrst, 'reload schema';
