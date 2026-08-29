// Periodic DB sync: copies new/updated rows from the main (source) Supabase
// project to the backup (target) project. Runs on a Cloudflare Cron Trigger —
// no server, no phone needed. Only pulls rows changed since the last successful
// sync (tracked per-table in the target's `sync_state` table), so each run is
// cheap even as the database grows.

const TABLES_WITH_UPDATED_AT = [
  "profiles", "courses", "enrollments", "classes", "class_notes",
  "exams", "exam_questions", "exam_schedules", "announcements",
  "app_settings", "heroes", "mentors", "resources", "reviews", "routines",
];

// Tables that only have created_at (no updated_at) — insert-only data.
const TABLES_CREATED_ONLY = [
  "exam_attempts", "exam_answers", "bookmarks", "payment_requests",
  "promo_codes", "user_notifications", "study_activity_logs",
];

async function fetchChangedRows(env, table, sinceIso, timestampCol) {
  const url = `${env.SOURCE_URL}/rest/v1/${table}?select=*&${timestampCol}=gt.${encodeURIComponent(sinceIso)}&order=${timestampCol}.asc&limit=1000`;
  const res = await fetch(url, {
    headers: { apikey: env.SOURCE_KEY, Authorization: `Bearer ${env.SOURCE_KEY}` },
  });
  if (!res.ok) {
    console.error(`fetch ${table} failed: ${res.status} ${await res.text()}`);
    return [];
  }
  return res.json();
}

async function upsertRows(env, table, rows) {
  if (!rows.length) return { ok: true };
  const res = await fetch(`${env.TARGET_URL}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: env.TARGET_KEY,
      Authorization: `Bearer ${env.TARGET_KEY}`,
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

async function getLastSync(env, table) {
  const res = await fetch(
    `${env.TARGET_URL}/rest/v1/sync_state?table_name=eq.${table}&select=last_synced_at`,
    { headers: { apikey: env.TARGET_KEY, Authorization: `Bearer ${env.TARGET_KEY}` } }
  );
  if (!res.ok) return "1970-01-01T00:00:00Z";
  const rows = await res.json();
  return rows[0]?.last_synced_at || "1970-01-01T00:00:00Z";
}

async function setLastSync(env, table, iso) {
  await fetch(`${env.TARGET_URL}/rest/v1/sync_state?on_conflict=table_name`, {
    method: "POST",
    headers: {
      apikey: env.TARGET_KEY,
      Authorization: `Bearer ${env.TARGET_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([{ table_name: table, last_synced_at: iso }]),
  });
}

async function syncTable(env, table, timestampCol) {
  const since = await getLastSync(env, table);
  const rows = await fetchChangedRows(env, table, since, timestampCol);
  if (rows.length === 0) return { table, synced: 0 };

  const result = await upsertRows(env, table, rows);
  if (!result.ok) return { table, synced: 0, error: result.error };

  const latest = rows[rows.length - 1][timestampCol];
  await setLastSync(env, table, latest);
  return { table, synced: rows.length };
}

async function runFullSync(env) {
  const results = [];
  for (const table of TABLES_WITH_UPDATED_AT) {
    results.push(await syncTable(env, table, "updated_at"));
  }
  for (const table of TABLES_CREATED_ONLY) {
    results.push(await syncTable(env, table, "created_at"));
  }
  return results;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runFullSync(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/sync/run" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!env.SYNC_API_KEY || body.apiKey !== env.SYNC_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });
      }
      const results = await runFullSync(env);
      return new Response(JSON.stringify({ success: true, results }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("db-sync worker: use POST /sync/run for manual trigger, or wait for the cron.", { status: 200 });
  },
};
