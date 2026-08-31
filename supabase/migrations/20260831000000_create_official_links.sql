-- Single-row table holding official contact/social links, editable by admin
create table if not exists public.official_links (
  id int primary key default 1,
  email text,
  whatsapp text,
  facebook_page text,
  facebook_group text,
  telegram text,
  youtube text,
  updated_at timestamptz not null default now(),
  constraint official_links_singleton check (id = 1)
);

insert into public.official_links (id, email, whatsapp, facebook_page, facebook_group, telegram, youtube)
values (
  1,
  'medihourofficial@gmail.com',
  '+8801639787547',
  'https://www.facebook.com/share/1EX8RkwBoP/',
  'https://www.facebook.com/share/g/1CsYjAfZxw/',
  'https://t.me/MediHour',
  'https://youtube.com/@medihour.official?si=Q-vU8sHvBB0cka-C'
)
on conflict (id) do nothing;

alter table public.official_links enable row level security;

create policy "Anyone can read official links"
  on public.official_links for select
  using (true);

create policy "Admins can update official links"
  on public.official_links for update
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert official links"
  on public.official_links for insert
  with check (public.has_role(auth.uid(), 'admin'));
