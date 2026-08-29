// scripts/archive-old-attempts.mjs
// Usage: node archive-old-attempts.mjs [--live]
// Default = dry run (no writes). Pass --live to actually move+delete.
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = !process.argv.includes("--live");
const CUTOFF_DAYS = 90;
const cutoff = new Date(Date.now() - CUTOFF_DAYS * 86400000).toISOString();

const main = createClient(process.env.MAIN_SUPABASE_URL, process.env.MAIN_SUPABASE_SERVICE_KEY);
const archive = createClient(process.env.ARCHIVE_SUPABASE_URL, process.env.ARCHIVE_SUPABASE_SERVICE_KEY);

const TABLES = [
  { name: "exam_attempts", dateCol: "submitted_at" },
  { name: "mock_exam_attempts", dateCol: "submitted_at" },
  { name: "qp_attempts", dateCol: "created_at" },
];

async function processTable({ name, dateCol }) {
  const { data: rows, error } = await main
    .from(name)
    .select("*")
    .not(dateCol, "is", null)
    .lt(dateCol, cutoff)
    .limit(500); // batch size per run, safe for cron frequency
  if (error) throw new Error(`${name} fetch failed: ${error.message}`);
  if (!rows || rows.length === 0) {
    console.log(`[${name}] nothing to archive.`);
    return;
  }

  console.log(`[${name}] found ${rows.length} rows older than ${CUTOFF_DAYS} days.`);
  if (DRY_RUN) {
    console.log(`[${name}] DRY RUN — no data moved. Re-run with --live to apply.`);
    return;
  }

  const archiveRows = rows.map((r) => ({
    source_table: name,
    original_id: String(r.id),
    row_data: r,
    original_created_at: r[dateCol],
  }));

  const { error: insertErr } = await archive.from("archived_rows").upsert(archiveRows, {
    onConflict: "source_table,original_id",
  });
  if (insertErr) throw new Error(`${name} archive insert failed, aborting delete: ${insertErr.message}`);

  const ids = rows.map((r) => r.id);
  const { error: deleteErr } = await main.from(name).delete().in("id", ids);
  if (deleteErr) throw new Error(`${name} archived but delete failed (data safe in archive, retry delete manually): ${deleteErr.message}`);

  console.log(`[${name}] archived + deleted ${rows.length} rows.`);
}

for (const table of TABLES) {
  await processTable(table);
}
console.log(DRY_RUN ? "\nDry run complete." : "\nLive archive run complete.");
