-- Manual % weights (nullable = auto/equal share) for subjects, chapters and topics.
alter table public.st_subjects add column if not exists weight numeric;
alter table public.st_chapters add column if not exists weight numeric;
alter table public.st_topics alter column weight type numeric using weight::numeric;
alter table public.st_topics alter column weight drop not null;
alter table public.st_topics alter column weight drop default;
update public.st_topics set weight = null where weight = 1;
