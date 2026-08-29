-- Run this on the ARCHIVE Supabase project (xnkuuzstschdovcyomfk), NOT the main one.
-- Generic archive table: stores old attempt rows as JSONB so it survives schema
-- changes on the main DB without needing to keep two schemas in sync.

create table if not exists public.archived_rows (
  id bigint generated always as identity primary key,
  source_table text not null,       -- 'exam_attempts' | 'mock_exam_attempts' | 'qp_attempts'
  original_id text not null,        -- original row's id (cast to text; uuid or bigint)
  row_data jsonb not null,          -- full original row as JSON
  original_created_at timestamptz,  -- original created_at/submitted_at, for reference
  archived_at timestamptz not null default now()
);

create index if not exists idx_archived_rows_source on public.archived_rows(source_table);
create index if not exists idx_archived_rows_original_id on public.archived_rows(source_table, original_id);
create unique index if not exists idx_archived_rows_unique on public.archived_rows(source_table, original_id);

alter table public.archived_rows enable row level security;

-- No public policies — this table is only ever accessed via the service_role
-- key from the backup script, never from the client app.
