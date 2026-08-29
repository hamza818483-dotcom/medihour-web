-- Dedicated tables for landing-page Telegram Support cards.
-- Each card is one row (e.g. "HSC 27"), and can contain multiple
-- topic/subtopic links inside it.

create table if not exists public.telegram_support_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_support_topics (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.telegram_support_cards(id) on delete cascade,
  title text not null,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.telegram_support_cards enable row level security;
alter table public.telegram_support_topics enable row level security;

-- Public can read (cards are shown on the public landing page + dashboard)
create policy "Public can view telegram support cards"
  on public.telegram_support_cards for select
  using (true);

create policy "Public can view telegram support topics"
  on public.telegram_support_topics for select
  using (true);

-- Only admins can insert/update/delete
create policy "Admins can manage telegram support cards"
  on public.telegram_support_cards for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage telegram support topics"
  on public.telegram_support_topics for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_telegram_support_topics_card_id
  on public.telegram_support_topics(card_id);
