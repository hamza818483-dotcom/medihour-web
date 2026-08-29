-- Fix FK to reference public.profiles instead of auth.users
alter table question_reports
drop constraint if exists question_reports_user_id_fkey;

alter table question_reports
add constraint question_reports_user_id_fkey
foreign key (user_id)
references public.profiles(id)
on delete cascade;
