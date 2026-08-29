-- Bug: admin resolve/decline never actually persisted because there was no
-- UPDATE policy on question_reports. RLS silently blocked the update (0 rows
-- affected, no error thrown), so status stayed 'pending' forever and the
-- report never left the admin's pending list.

create policy "Admins can update reports"
  on public.question_reports for update
  using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  )
  with check (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  );

NOTIFY pgrst, 'reload schema';
