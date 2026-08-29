// Periodic incremental backup: copies new/updated rows from the MAIN Supabase
// project into THIS (backup) project. Triggered by pg_cron every 6 hours —
// no external server, no worker, no phone needed. Only pulls rows changed
// since the last successful sync (tracked in `sync_state`), so it stays cheap.

const SOURCE_URL = Deno.env.get("SOURCE_URL")!;
const SOURCE_KEY = Deno.env.get("SOURCE_KEY")!;
// This project IS the target — use its own built-in service role env vars.
const TARGET_URL = Deno.env.get("SUPABASE_URL")!;
const TARGET_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TABLES_WITH_UPDATED_AT = [
  "profiles", "courses", "enrollments", "classes",
  "exams", "exam_questions", "exam_schedules",
  "heroes", "mentors", "resources",
];

// Tables that only have created_at (no updated_at) — insert-only data.
const TABLES_CREATED_ONLY = [
  "class_notes", "announcements", "reviews", "routines",
  "exam_attempts", "exam_answers", "bookmarks", "payment_requests",
  "promo_codes", "user_notifications", "study_activity_logs",
];

// app_settings has a non-"id" primary key (key) — handled separately below.
const APP_SETTINGS_CONFLICT_COL = "key";

async function fetchChangedRows(table: string, sinceIso: string, timestampCol: string) {
  const url = `${SOURCE_URL}/rest/v1/${table}?select=*&${timestampCol}=gt.${encodeURIComponent(sinceIso)}&order=${timestampCol}.asc&limit=1000`;
  const res = await fetch(url, {
    headers: { apikey: SOURCE_KEY, Authorization: `Bearer ${SOURCE_KEY}` },
  });
  if (!res.ok) {
    console.error(`fetch ${table} failed: ${res.status} ${await res.text()}`);
    return [];
  }
  return res.json();
}

async function upsertRows(table: string, rows: any[]) {
  if (!rows.length) return { ok: true };
  const conflictCol = table === "app_settings" ? APP_SETTINGS_CONFLICT_COL : "id";
  const res = await fetch(`${TARGET_URL}/rest/v1/${table}?on_conflict=${conflictCol}`, {
    method: "POST",
    headers: {
      apikey: TARGET_KEY,
      Authorization: `Bearer ${TARGET_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`upsert ${table} failed: ${res.status} ${text}`);
    return { ok: false, error: text };
  }
  return { ok: true };
}

async function getLastSync(table: string) {
  const res = await fetch(
    `${TARGET_URL}/rest/v1/sync_state?table_name=eq.${table}&select=last_synced_at`,
    { headers: { apikey: TARGET_KEY, Authorization: `Bearer ${TARGET_KEY}` } }
  );
  if (!res.ok) return "1970-01-01T00:00:00Z";
  const rows = await res.json();
  return rows[0]?.last_synced_at || "1970-01-01T00:00:00Z";
}

async function setLastSync(table: string, iso: string) {
  await fetch(`${TARGET_URL}/rest/v1/sync_state?on_conflict=table_name`, {
    method: "POST",
    headers: {
      apikey: TARGET_KEY,
      Authorization: `Bearer ${TARGET_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([{ table_name: table, last_synced_at: iso }]),
  });
}

async function syncTable(table: string, timestampCol: string) {
  let since = await getLastSync(table);
  let totalSynced = 0;

  // Loop until a fetch returns fewer than the page size — handles more than
  // 1000 changed rows in a single cron run instead of leaving the rest for
  // the next hour.
  while (true) {
    const rows = await fetchChangedRows(table, since, timestampCol);
    if (rows.length === 0) break;

    const result = await upsertRows(table, rows);
    if (!result.ok) return { table, synced: totalSynced, error: result.error };

    totalSynced += rows.length;
    since = rows[rows.length - 1][timestampCol];
    await setLastSync(table, since);

    if (rows.length < 1000) break;
  }

  return { table, synced: totalSynced };
}

async function runFullSync() {
  const results = [];
  for (const table of TABLES_WITH_UPDATED_AT) {
    results.push(await syncTable(table, "updated_at"));
  }
  for (const table of TABLES_CREATED_ONLY) {
    results.push(await syncTable(table, "created_at"));
  }
  results.push(await syncTable("app_settings", "updated_at"));
  return results;
}

Deno.serve(async (_req) => {
  try {
    const results = await runFullSync();
    return new Response(JSON.stringify({ success: true, results }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
