-- Grant admin (highest role) to main owner by phone number
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where phone = '01754365403'
  limit 1;

  if v_user_id is null then
    raise exception 'No profile found with phone 01754365403';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'admin'::public.app_role)
  on conflict (user_id, role) do nothing;
end $$;
