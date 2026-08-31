-- Success Gallery: student achievement photos shown in scrolling marquee on landing page
create table if not exists public.success_gallery (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.success_gallery enable row level security;

create policy "Anyone can read success gallery"
  on public.success_gallery for select
  using (true);

create policy "Admins can insert success gallery"
  on public.success_gallery for insert
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update success gallery"
  on public.success_gallery for update
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete success gallery"
  on public.success_gallery for delete
  using (public.has_role(auth.uid(), 'admin'));
