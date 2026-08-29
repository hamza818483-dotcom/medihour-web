-- Tracks the last successful sync timestamp per table, for the atlas-db-sync
-- Cloudflare Worker (cron-based incremental backup from main DB). This table
-- lives on the TARGET/backup project only.
CREATE TABLE IF NOT EXISTS public.sync_state (
    table_name text PRIMARY KEY,
    last_synced_at timestamp with time zone NOT NULL DEFAULT '1970-01-01T00:00:00Z',
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

-- Only the service role (used by the worker) touches this table; no public policy needed.
