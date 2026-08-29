-- Allow admins to insert notifications to send messages to users
create policy "Admins can insert notifications"
  on user_notifications for insert
  with check (
    exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role in ('admin', 'moderator')
    )
  );
