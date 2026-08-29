var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// atlas-ai-proxy-worker.js
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, Prefer"
};
var MAX_ROTATION_ROUNDS = 1;
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
__name(sleep, "sleep");
var PROVIDER_TIMEOUT_MS = 12e3;
var MAX_SUBREQUESTS_PER_INVOCATION = 45;
function makeSubrequestBudget() {
  return { count: 0, exhausted() {
    return this.count >= MAX_SUBREQUESTS_PER_INVOCATION;
  }, use() {
    this.count++;
  } };
}
__name(makeSubrequestBudget, "makeSubrequestBudget");
async function attemptWithStatus(fn, budget) {
  if (budget && budget.exhausted()) {
    return { __exception: true, __budgetExhausted: true, message: `subrequest budget exhausted (${MAX_SUBREQUESTS_PER_INVOCATION}/invocation) \u2014 stopped before hitting CF's hard limit` };
  }
  if (budget)
    budget.use();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (e) {
    const isTimeout = e?.name === "AbortError";
    return { __exception: true, message: isTimeout ? `timeout after ${PROVIDER_TIMEOUT_MS}ms` : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
__name(attemptWithStatus, "attemptWithStatus");
var atlas_ai_proxy_worker_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    const d1Match = path.match(/^\/d1\/([a-z_][a-z0-9_]*)$/) || path.match(/^\/rest\/v1\/([a-z_][a-z0-9_]*)$/);
    if (d1Match) {
      return handleD1Table(d1Match[1], request, env, url, ctx);
    }
    const storageMatch = path.match(/^\/storage\/pdfs\/(.+)$/);
    if (storageMatch) {
      return handlePdfStorage(storageMatch[1], request, env);
    }
    const expImgMatch = path.match(/^\/storage\/exp-images\/(.+)$/);
    if (expImgMatch) {
      return handleExpImageStorage(expImgMatch[1], request, env);
    }
    if (path === "/mcq-job/status") {
      return handleMcqJobStatus(url, env);
    }
    if (path === "/push/send" && request.method === "POST") {
      return handlePushSend(request, env);
    }
    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "Only POST allowed" }, 405);
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    if (path === "/ocr-page" || path === "/ocr-status") {
      return jsonResponse({ success: false, error: "OCR endpoint disabled \u2014 client-side Tesseract.js \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u09BE \u09B9\u099A\u09CD\u099B\u09C7, AI quota \u09AC\u09BE\u0981\u099A\u09BE\u09A4\u09C7" }, 410);
    }
    if (path === "/mcq-job/create" && request.method === "POST") {
      return handleMcqJobCreate(body, env);
    }
    const question = (body.question || "").trim();
    const image = body.image || null;
    const systemPrompt = body.systemPrompt || "\u09A4\u09C1\u09AE\u09BF \u098F\u0995\u099C\u09A8 \u09B8\u09B9\u09BE\u09AF\u09BC\u0995 AI\u0964";
    const skipGemini = !!body.skipGemini;
    const skipGroq = !!body.skipGroq;
    if (!question && !image) {
      return jsonResponse({ success: false, error: "question \u09AC\u09BE image \u098F\u09B0 \u098F\u0995\u099F\u09BF \u09A6\u09BF\u09A4\u09C7 \u09B9\u09AC\u09C7" }, 400);
    }
    const budget = makeSubrequestBudget();
    const expectMcqArray = /option_k/.test(systemPrompt);

    // --- Order: Gemini tried FIRST. Groq only runs if Gemini fails on every
    // key. Then openrouter -> cerebras -> cloudflare. ---
    const errors = [];
    let result = null;

    if (!skipGemini) {
      try {
        const geminiResult = await callGemini(env, question, systemPrompt, image, budget);
        if (geminiResult && geminiResult.answer && geminiResult.answer.trim().length > 5) {
          result = geminiResult;
        } else if (geminiResult?.error) {
          errors.push(geminiResult.error);
        }
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }

    if (!result && !skipGroq) {
      try {
        const groqResult = await callGroq(env, question, systemPrompt, image, expectMcqArray, budget);
        if (groqResult && groqResult.answer && groqResult.answer.trim().length > 5) {
          result = groqResult;
        } else if (groqResult?.error) {
          errors.push(groqResult.error);
        }
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }

    if (!result) {
      const remainingProviders = [
        { name: "openrouter", fn: () => callOpenRouter(env, question, systemPrompt, image, budget) },
        { name: "cerebras", fn: () => callCerebras(env, question, systemPrompt, image, budget) },
        { name: "cloudflare", fn: () => callCloudflareAI(env, question, systemPrompt, image, budget) }
      ];
      for (const p of remainingProviders) {
        try {
          const r = await p.fn();
          if (r && r.answer && r.answer.trim().length > 5) {
            result = r;
            break;
          }
          if (r?.error) errors.push(r.error);
        } catch (e) {
          errors.push(String(e.message || e));
        }
      }
    }

    if (result) {
      return jsonResponse({ success: true, answer: result.answer, provider: result.provider });
    }
    return jsonResponse({
      success: false,
      error: "\u09B8\u09AC AI provider \u09AC\u09CD\u09AF\u09B0\u09CD\u09A5 \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0986\u09AC\u09BE\u09B0 \u099A\u09C7\u09B7\u09CD\u099F\u09BE \u0995\u09B0\u09CB\u0964",
      details: errors
    }, 502);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processPendingMcqJobs(env));
  }
};
async function handlePdfStorage(fileName, request, env) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (request.method === "POST" || request.method === "PUT") {
    const apiKey = request.headers.get("apikey") || request.headers.get("Authorization")?.replace("Bearer ", "");
    if (apiKey !== env.D1_API_KEY) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    try {
      await env.PDF_BUCKET.put(safeName, request.body, {
        httpMetadata: { contentType: request.headers.get("Content-Type") || "application/pdf" }
      });
      return jsonResponse({ success: true, fileName: safeName });
    } catch (e) {
      return jsonResponse({ success: false, error: String(e.message || e) }, 500);
    }
  }
  if (request.method === "GET") {
    const obj = await env.PDF_BUCKET.get(safeName);
    if (!obj)
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    const headers = new Headers(CORS_HEADERS);
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("Content-Type", obj.httpMetadata?.contentType || "application/pdf");
    return new Response(obj.body, { headers });
  }
  return jsonResponse({ success: false, error: "Method not allowed" }, 405);
}
__name(handlePdfStorage, "handlePdfStorage");
async function handleExpImageStorage(fileName, request, env) {
  const safeName = "exp-images/" + fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (request.method === "POST" || request.method === "PUT") {
    const apiKey = request.headers.get("apikey") || request.headers.get("Authorization")?.replace("Bearer ", "");
    if (apiKey !== env.D1_API_KEY) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    try {
      await env.PDF_BUCKET.put(safeName, request.body, {
        httpMetadata: { contentType: request.headers.get("Content-Type") || "image/jpeg" }
      });
      return jsonResponse({ success: true, key: fileName });
    } catch (e) {
      return jsonResponse({ success: false, error: String(e.message || e) }, 500);
    }
  }
  if (request.method === "GET") {
    const obj = await env.PDF_BUCKET.get(safeName);
    if (!obj)
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    const headers = new Headers(CORS_HEADERS);
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(obj.body, { headers });
  }
  if (request.method === "DELETE") {
    const apiKey = request.headers.get("apikey") || request.headers.get("Authorization")?.replace("Bearer ", "");
    if (apiKey !== env.D1_API_KEY) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    try {
      await env.PDF_BUCKET.delete(safeName);
      return jsonResponse({ success: true });
    } catch (e) {
      return jsonResponse({ success: false, error: String(e.message || e) }, 500);
    }
  }
  return jsonResponse({ success: false, error: "Method not allowed" }, 405);
}
__name(handleExpImageStorage, "handleExpImageStorage");
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
async function handleD1Table(table, request, env, url, ctx) {
  const BACKUP_TABLES = /* @__PURE__ */ new Set(["users"]);
  function backupToSupabase(method, rows) {
    if (!BACKUP_TABLES.has(table))
      return;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY)
      return;
    if (!rows || !rows.length)
      return;
    const job = (async () => {
      for (const row of rows) {
        try {
          if (method === "DELETE") {
            await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?phone=eq.${row.phone}`, {
              method: "DELETE",
              headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
            });
          } else {
            await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=phone`, {
              method: "POST",
              headers: {
                apikey: env.SUPABASE_KEY,
                Authorization: `Bearer ${env.SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal"
              },
              body: JSON.stringify(row)
            });
          }
        } catch (_) {
        }
      }
    })();
    if (ctx && ctx.waitUntil)
      ctx.waitUntil(job);
  }
  __name(backupToSupabase, "backupToSupabase");
  if (!/^[a-z_][a-z0-9_]*$/.test(table))
    return jsonResponse({ error: "Invalid table name" }, 400);
  const apiKey = request.headers.get("apikey") || request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!env.D1_API_KEY || apiKey !== env.D1_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const db = env.MULBOI_DB;
  if (!db)
    return jsonResponse({ error: "D1 binding MULBOI_DB missing" }, 500);
  const tblCheck = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  ).bind(table).first();
  if (!tblCheck)
    return jsonResponse({ error: "Unknown table: " + table }, 404);
  const params = url.searchParams;
  function parseSingleFilter(key, val) {
    const m = val.match(/^(eq|gte|lte|gt|lt|neq)\.(.*)$/);
    if (m) {
      const opMap = { eq: "=", gte: ">=", lte: "<=", gt: ">", lt: "<", neq: "!=" };
      return { clause: `${key} ${opMap[m[1]]} ?`, args: [m[2]] };
    }
    const inm = val.match(/^in\.\((.*)\)$/);
    if (inm) {
      const vals = inm[1].split(",").map((v) => v.trim());
      return { clause: `${key} IN (${vals.map(() => "?").join(",")})`, args: vals };
    }
    const ism = val.match(/^is\.(null|true|false)$/i);
    if (ism) {
      const v = ism[1].toLowerCase();
      if (v === "null")
        return { clause: `${key} IS NULL`, args: [] };
      return { clause: `${key} = ?`, args: [v === "true" ? 1 : 0] };
    }
    return null;
  }
  __name(parseSingleFilter, "parseSingleFilter");
  function parseEqFilters() {
    const where = [];
    const args = [];
    for (const [key, val] of params.entries()) {
      if (["select", "order", "limit", "on_conflict"].includes(key))
        continue;
      if (key === "or") {
        const inner = val.match(/^\((.*)\)$/)?.[1] || val;
        const parts = inner.split(",");
        const orClauses = [];
        for (const p of parts) {
          const pm = p.match(/^([a-z_][a-z0-9_]*)\.(.+)$/i);
          if (!pm)
            continue;
          const f2 = parseSingleFilter(pm[1], pm[2]);
          if (f2) {
            orClauses.push(f2.clause);
            args.push(...f2.args);
          }
        }
        if (orClauses.length)
          where.push("(" + orClauses.join(" OR ") + ")");
        continue;
      }
      const f = parseSingleFilter(key, val);
      if (f) {
        where.push(f.clause);
        args.push(...f.args);
      }
    }
    return { where, args };
  }
  __name(parseEqFilters, "parseEqFilters");
  function parseSelectEmbeds(selectParam) {
    if (!selectParam || !selectParam.includes("("))
      return null;
    const embeds = [];
    const baseCols = [];
    let depth = 0, cur = "";
    const tokens = [];
    for (const ch of selectParam) {
      if (ch === "(")
        depth++;
      if (ch === ")")
        depth--;
      if (ch === "," && depth === 0) {
        tokens.push(cur);
        cur = "";
      } else
        cur += ch;
    }
    if (cur)
      tokens.push(cur);
    for (const tok of tokens) {
      const m = tok.match(/^([a-z_][a-z0-9_]*)\((.*)\)$/i);
      if (m)
        embeds.push({ table: m[1], inner: m[2] });
      else if (tok.trim())
        baseCols.push(tok.trim());
    }
    return { baseCols, embeds };
  }
  __name(parseSelectEmbeds, "parseSelectEmbeds");
  const EMBED_FK_MAP = {
    users: { parentCol: "user_phone", childCol: "phone" },
    book_chapters: { parentCol: "chapter_id", childCol: "id" },
    book_subjects: { parentCol: "subject_id", childCol: "id" }
  };
  async function attachEmbeds(rows, embeds) {
    if (!rows.length)
      return rows;
    for (const emb of embeds) {
      const fk = EMBED_FK_MAP[emb.table];
      if (!fk || !(fk.parentCol in rows[0]))
        continue;
      const subEmbedInfo = parseSelectEmbeds(emb.inner);
      const cols = subEmbedInfo ? subEmbedInfo.baseCols.length ? subEmbedInfo.baseCols.join(",") : "*" : emb.inner;
      const keys = [...new Set(rows.map((r) => r[fk.parentCol]).filter((v) => v !== null && v !== void 0))];
      if (!keys.length)
        continue;
      const placeholders = keys.map(() => "?").join(",");
      const selectCols = cols === "*" ? "*" : cols.includes(fk.childCol) ? cols : cols + "," + fk.childCol;
      const sub = await db.prepare(
        `SELECT ${selectCols} FROM ${emb.table} WHERE ${fk.childCol} IN (${placeholders})`
      ).bind(...keys).all();
      let subRows = sub.results || [];
      if (subEmbedInfo && subEmbedInfo.embeds.length) {
        subRows = await attachEmbeds(subRows, subEmbedInfo.embeds);
      }
      const byKey = new Map(subRows.map((r) => [r[fk.childCol], r]));
      for (const row of rows) {
        row[emb.table] = byKey.get(row[fk.parentCol]) || null;
      }
    }
    return rows;
  }
  __name(attachEmbeds, "attachEmbeds");
  try {
    if (request.method === "GET") {
      const { where, args } = parseEqFilters();
      const selCols = params.get("select") || "*";
      const embedInfo = parseSelectEmbeds(selCols);
      const sqlSelCols = embedInfo ? embedInfo.baseCols.length ? embedInfo.baseCols.join(",") : "*" : selCols;
      let sql = `SELECT ${sqlSelCols === "*" ? "*" : sqlSelCols} FROM ${table}`;
      if (where.length)
        sql += " WHERE " + where.join(" AND ");
      const orderParam = params.get("order");
      if (orderParam) {
        const orderParts = orderParam.split(",").map((part) => {
          const [col, dir] = part.split(".");
          return `${col} ${dir === "desc" ? "DESC" : "ASC"}`;
        });
        sql += " ORDER BY " + orderParts.join(", ");
      }
      const limitParam = params.get("limit");
      if (limitParam)
        sql += ` LIMIT ${parseInt(limitParam, 10) || 500}`;
      const res = await db.prepare(sql).bind(...args).all();
      let rows = res.results || [];
      if (embedInfo && embedInfo.embeds.length)
        rows = await attachEmbeds(rows, embedInfo.embeds);
      return jsonResponse(rows);
    }
    if (request.method === "POST") {
      const body = await request.json();
      const rowsIn = Array.isArray(body) ? body : [body];
      if (!rowsIn.length)
        return jsonResponse({ error: "empty body" }, 400);
      const onConflict = params.get("on_conflict");
      const insertedRows = [];
      for (const r of rowsIn) {
        const cols = Object.keys(r);
        if (!cols.length)
          continue;
        const placeholders = cols.map(() => "?").join(", ");
        const args = cols.map((c) => r[c]);
        let row;
        if (onConflict) {
          const conflictCols = onConflict.split(",");
          const updateSet = cols.filter((c) => !conflictCols.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
          await db.prepare(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})
                         ON CONFLICT(${conflictCols.join(",")})
                         DO UPDATE SET ${updateSet || cols[0] + " = excluded." + cols[0]}`
          ).bind(...args).run();
          const whereConf = conflictCols.map((c) => `${c} = ?`).join(" AND ");
          const confArgs = conflictCols.map((c) => r[c]);
          row = await db.prepare(`SELECT * FROM ${table} WHERE ${whereConf}`).bind(...confArgs).first();
        } else {
          const ins = await db.prepare(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`
          ).bind(...args).run();
          row = await db.prepare(`SELECT * FROM ${table} WHERE rowid=?`).bind(ins.meta.last_row_id).first();
        }
        insertedRows.push(row);
      }
      backupToSupabase("POST", insertedRows);
      return jsonResponse(insertedRows, 201);
    }
    if (request.method === "PATCH") {
      const { where, args } = parseEqFilters();
      if (!where.length)
        return jsonResponse({ error: "filter required for PATCH" }, 400);
      const body = await request.json();
      const setCols = Object.keys(body);
      if (!setCols.length)
        return jsonResponse({ error: "no fields to update" }, 400);
      const setSql = setCols.map((c) => `${c} = ?`).join(", ");
      const setArgs = setCols.map((c) => body[c]);
      await db.prepare(`UPDATE ${table} SET ${setSql} WHERE ${where.join(" AND ")}`).bind(...setArgs, ...args).run();
      const rows = await db.prepare(`SELECT * FROM ${table} WHERE ${where.join(" AND ")}`).bind(...args).all();
      backupToSupabase("PATCH", rows.results || []);
      return jsonResponse(rows.results || []);
    }
    if (request.method === "DELETE") {
      const { where, args } = parseEqFilters();
      if (!where.length)
        return jsonResponse({ error: "filter required for DELETE" }, 400);
      const toDelete = await db.prepare(`SELECT * FROM ${table} WHERE ${where.join(" AND ")}`).bind(...args).all();
      await db.prepare(`DELETE FROM ${table} WHERE ${where.join(" AND ")}`).bind(...args).run();
      backupToSupabase("DELETE", toDelete.results || []);
      return jsonResponse([], 200);
    }
    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (e) {
    return jsonResponse({ error: String(e && e.message || e) }, 500);
  }
}
__name(handleD1Table, "handleD1Table");
function getGeminiKeys(env) {
  const keys = [];
  if (env.GEMINI_KEYS)
    keys.push(...env.GEMINI_KEYS.split(",").map((k) => k.trim()).filter(Boolean));
  if (env.GEMINI_API_KEY)
    keys.push(env.GEMINI_API_KEY.trim());
  return [...new Set(keys)];
}
__name(getGeminiKeys, "getGeminiKeys");
var GEMINI_MODELS = ["gemini-2.5-flash"];
async function callGeminiOnce(key, model, parts, maxOutputTokens, signal) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens, temperature: 0.7 } }),
      signal
    }
  );
  return res;
}
__name(callGeminiOnce, "callGeminiOnce");
async function callGemini(env, question, systemPrompt, image, budget) {
  const keys = getGeminiKeys(env);
  if (!keys.length)
    return { error: "GEMINI_API_KEY not set" };
  const parts = [];
  if (image)
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  parts.push({ text: systemPrompt + "\n\n\u09AA\u09CD\u09B0\u09B6\u09CD\u09A8: " + (question || "\u098F\u0987 \u099B\u09AC\u09BF\u099F\u09BF \u09AC\u09BF\u09B6\u09CD\u09B2\u09C7\u09B7\u09A3 \u0995\u09B0\u09CB\u0964") });
  let lastError = "Gemini: no keys/models worked";
  const exhaustedKeys = /* @__PURE__ */ new Set();
  const shuffledGeminiKeys = shuffleKeys(keys);
  let consecutive429 = 0;
  outerGemini:
    for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
      const healthyKeys = shuffledGeminiKeys.filter((k) => !exhaustedKeys.has(k));
      if (!healthyKeys.length)
        break;
      for (const model of GEMINI_MODELS) {
        for (const key of healthyKeys) {
          const outcome = await attemptWithStatus((signal) => callGeminiOnce(key, model, parts, 16384, signal), budget);
          if (outcome.__exception) {
            lastError = `Gemini(${model}) exception: ${outcome.message}`;
            if (outcome.__budgetExhausted)
              return { error: lastError };
            continue;
          }
          if (!outcome.ok) {
            lastError = `Gemini(${model}) HTTP ${outcome.status}`;
            if (outcome.status === 429) {
              exhaustedKeys.add(key);
              consecutive429++;
              if (consecutive429 >= 2) {
                lastError = `Gemini: quota exhausted (429 on ${consecutive429} keys), abandoning provider to save budget`;
                break outerGemini;
              }
            } else {
              consecutive429 = 0;
            }
            continue;
          }
          const data = await outcome.json().catch(() => null);
          const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
          if (answer)
            return { answer, provider: `gemini:${model}` };
          lastError = `Gemini(${model}): empty response`;
        }
      }
      if (round < MAX_ROTATION_ROUNDS - 1)
        await sleep(400 * (round + 1));
    }
  return { error: lastError };
}
__name(callGemini, "callGemini");
function getOpenRouterKeys(env) {
  const keys = [];
  if (env.OPENROUTER_KEYS)
    keys.push(...env.OPENROUTER_KEYS.split(",").map((k) => k.trim()).filter(Boolean));
  if (env.OPENROUTER_API_KEY)
    keys.push(env.OPENROUTER_API_KEY.trim());
  return [...new Set(keys)];
}
__name(getOpenRouterKeys, "getOpenRouterKeys");
var OPENROUTER_MODELS = ["qwen/qwen2.5-vl-72b-instruct:free", "meta-llama/llama-3.2-11b-vision-instruct:free"];
async function callOpenRouter(env, question, systemPrompt, image, budget) {
  const keys = getOpenRouterKeys(env);
  if (!keys.length)
    return { error: "OPENROUTER_API_KEY not set" };
  let userContent;
  if (image) {
    userContent = [
      { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
      { type: "text", text: question || "\u098F\u0987 \u099B\u09AC\u09BF\u099F\u09BF \u09AC\u09BF\u09B6\u09CD\u09B2\u09C7\u09B7\u09A3 \u0995\u09B0\u09CB \u098F\u09AC\u0982 \u09AC\u09BE\u0982\u09B2\u09BE\u09AF\u09BC \u09AC\u09CD\u09AF\u09BE\u0996\u09CD\u09AF\u09BE \u09A6\u09BE\u0993\u0964" }
    ];
  } else {
    userContent = question;
  }
  let lastError = "OpenRouter: no keys/models worked";
  const shuffledOpenRouterKeys = shuffleKeys(keys);
  for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
    for (const model of OPENROUTER_MODELS) {
      for (const key of shuffledOpenRouterKeys) {
        const outcome = await attemptWithStatus((signal) => fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent }
            ],
            temperature: 0.7,
            max_tokens: 8192
          })
        }), budget);
        if (outcome.__exception) {
          lastError = `OpenRouter(${model}) exception: ${outcome.message}`;
          if (outcome.__budgetExhausted)
            return { error: lastError };
          continue;
        }
        if (!outcome.ok) {
          lastError = `OpenRouter(${model}) HTTP ${outcome.status}`;
          continue;
        }
        const data = await outcome.json().catch(() => null);
        const answer = data?.choices?.[0]?.message?.content || null;
        if (answer)
          return { answer, provider: `openrouter:${model}` };
        lastError = `OpenRouter(${model}): empty response`;
      }
    }
    if (round < MAX_ROTATION_ROUNDS - 1)
      await sleep(400 * (round + 1));
  }
  return { error: lastError };
}
__name(callOpenRouter, "callOpenRouter");
// Load-balancing fix: without this, every concurrent request iterates keys
// in the same fixed order (keys[0] first), so under simultaneous load all
// users hammer the same single key until it alone hits its per-day limit,
// instead of spreading load across every available key. Shuffling per-call
// distributes concurrent traffic roughly evenly from the very first request.
function shuffleKeys(keys) {
  const arr = [...keys];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
__name(shuffleKeys, "shuffleKeys");
function getGroqKeys(env) {
  const keys = [];
  if (env.GROQ_KEYS)
    keys.push(...env.GROQ_KEYS.split(",").map((k) => k.trim()).filter(Boolean));
  if (env.GROQ_API_KEY)
    keys.push(env.GROQ_API_KEY.trim());
  return [...new Set(keys)];
}
__name(getGroqKeys, "getGroqKeys");
var GROQ_TEXT_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
var GROQ_IMAGE_MODELS = ["meta-llama/llama-4-maverick-17b-128e-instruct", "meta-llama/llama-4-scout-17b-16e-instruct"];
var GROQ_MCQ_JSON_SCHEMA = {
  name: "mcq_list",
  strict: true,
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            option_k: { type: "string" },
            option_kh: { type: "string" },
            option_g: { type: "string" },
            option_gh: { type: "string" },
            correct: { type: "string", enum: ["k", "kh", "g", "gh"] },
            explanation: { type: "string" }
          },
          required: ["question", "option_k", "option_kh", "option_g", "option_gh", "correct", "explanation"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  }
};
function mbGroqUnwrapAnswer(answer) {
  try {
    const parsedObj = JSON.parse(answer);
    if (parsedObj && Array.isArray(parsedObj.questions)) {
      return JSON.stringify(parsedObj.questions);
    }
  } catch (_) {
  }
  return answer;
}
__name(mbGroqUnwrapAnswer, "mbGroqUnwrapAnswer");
function mbGroqLooksLikeValidMcqArray(answer) {
  let arr;
  try {
    arr = JSON.parse(answer);
  } catch (_) {
    return /[\[{]/.test(answer);
  }
  if (!Array.isArray(arr))
    return false;
  if (!arr.length)
    return false;
  const requiredKeys = ["question", "option_k", "option_kh", "option_g", "option_gh", "correct"];
  const validCount = arr.filter((m) => m && typeof m === "object" && requiredKeys.every((k) => typeof m[k] === "string" && m[k].trim().length > 0)).length;
  return validCount >= Math.ceil(arr.length / 2);
}
__name(mbGroqLooksLikeValidMcqArray, "mbGroqLooksLikeValidMcqArray");
async function callGroq(env, question, systemPrompt, image, expectMcqArray, budget) {
  const keys = getGroqKeys(env);
  if (!keys.length)
    return { error: "GROQ_API_KEY not set" };
  const models = image ? GROQ_IMAGE_MODELS : GROQ_TEXT_MODELS;
  // FIX: only append the "must be JSON" instruction + force response_format
  // when we actually need a JSON MCQ array (expectMcqArray). Plain
  // explanation/chat questions must stay natural plain text, otherwise the
  // model invents its own ad-hoc JSON shape and the UI shows raw braces.
  const jsonSystemPrompt = expectMcqArray
    ? systemPrompt + `

GURUTTOPURNO: \u09B6\u09C1\u09A7\u09C1\u09AE\u09BE\u09A4\u09CD\u09B0 \u098F\u0987 \u09AB\u09B0\u09AE\u09CD\u09AF\u09BE\u099F\u09C7 \u098F\u0995\u099F\u09BE valid JSON object \u09A6\u09BE\u0993, \u0985\u09A8\u09CD\u09AF \u0995\u09CB\u09A8\u09CB preamble/markdown/\u09AC\u09CD\u09AF\u09BE\u0996\u09CD\u09AF\u09BE \u099B\u09BE\u09A1\u09BC\u09BE: {"questions": [ ...\u098F\u0996\u09BE\u09A8\u09C7 array... ]}`
    : systemPrompt;
  let messages;
  if (image) {
    messages = [
      { role: "system", content: jsonSystemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
          { type: "text", text: question || "\u098F\u0987 \u099B\u09AC\u09BF\u099F\u09BF \u09AC\u09BF\u09B6\u09CD\u09B2\u09C7\u09B7\u09A3 \u0995\u09B0\u09CB \u098F\u09AC\u0982 \u09AC\u09BE\u0982\u09B2\u09BE\u09AF\u09BC \u09AC\u09CD\u09AF\u09BE\u0996\u09CD\u09AF\u09BE \u09A6\u09BE\u0993\u0964" }
        ]
      }
    ];
  } else {
    messages = [
      { role: "system", content: jsonSystemPrompt },
      { role: "user", content: question }
    ];
  }
  let lastError = "Groq: no keys/models worked";
  const exhaustedKeys = /* @__PURE__ */ new Set();
  const shuffledKeys = shuffleKeys(keys);
  for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
    for (const model of models) {
      const isTextModel = GROQ_TEXT_MODELS.includes(model);
      const requestBody = {
        model,
        messages,
        temperature: 0.7,
        max_tokens: 8192,
        ...(isTextModel && expectMcqArray
          ? { response_format: { type: "json_schema", json_schema: GROQ_MCQ_JSON_SCHEMA } }
          : {})
      };
      let keyResult = null;
      const healthyKeys = shuffledKeys.filter((k) => !exhaustedKeys.has(k));
      for (const key of healthyKeys.length ? healthyKeys : shuffledKeys) {
        const outcome = await attemptWithStatus((signal) => fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          signal,
          body: JSON.stringify(requestBody)
        }), budget);
        if (outcome.__exception) {
          lastError = `Groq(${model}) exception: ${outcome.message}`;
          if (outcome.__budgetExhausted)
            return { error: lastError };
          continue;
        }
        if (!outcome.ok) {
          if (isTextModel && expectMcqArray && outcome.status === 400) {
            const fbOutcome = await attemptWithStatus((signal2) => fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              signal: signal2,
              body: JSON.stringify({ ...requestBody, response_format: { type: "json_object" } })
            }), budget);
            if (fbOutcome.ok) {
              const fbData = await fbOutcome.json().catch(() => null);
              const fbAnswer = fbData?.choices?.[0]?.message?.content || null;
              if (fbAnswer) {
                keyResult = mbGroqUnwrapAnswer(fbAnswer);
                break;
              }
            } else if (fbOutcome.__budgetExhausted) {
              return { error: `Groq(${model}) exception: ${fbOutcome.message}` };
            }
          }
          lastError = `Groq(${model}) HTTP ${outcome.status}`;
          if (outcome.status === 429) exhaustedKeys.add(key);
          continue;
        }
        const data = await outcome.json().catch(() => null);
        let answer = data?.choices?.[0]?.message?.content || null;
        if (answer) {
          if (expectMcqArray) {
            answer = mbGroqUnwrapAnswer(answer);
            if (mbGroqLooksLikeValidMcqArray(answer)) {
              keyResult = answer;
              break;
            }
            lastError = `Groq(${model}): invalid MCQ shape, retrying other key/model`;
          } else {
            keyResult = answer;
            break;
          }
        } else {
          lastError = `Groq(${model}): empty response`;
        }
      }
        if (keyResult)
          return { answer: keyResult, provider: `groq:${model}` };
      }
      if (round < MAX_ROTATION_ROUNDS - 1)
        await sleep(400 * (round + 1));
    }
  return { error: lastError };
}
__name(callGroq, "callGroq");
function getCerebrasKeys(env) {
  const keys = [];
  if (env.CEREBRAS_KEYS)
    keys.push(...env.CEREBRAS_KEYS.split(",").map((k) => k.trim()).filter(Boolean));
  if (env.CEREBRAS_API_KEY)
    keys.push(env.CEREBRAS_API_KEY.trim());
  return [...new Set(keys)];
}
__name(getCerebrasKeys, "getCerebrasKeys");
var CEREBRAS_MODELS = ["gpt-oss-120b", "llama-3.3-70b"];
async function callCerebras(env, question, systemPrompt, image, budget) {
  if (image)
    return { error: "Cerebras: vision not supported, skipped" };
  const keys = getCerebrasKeys(env);
  if (!keys.length)
    return { error: "CEREBRAS_API_KEY not set" };
  let lastError = "Cerebras: no keys/models worked";
  const shuffledCerebrasKeys = shuffleKeys(keys);
  for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
    for (const model of CEREBRAS_MODELS) {
      for (const key of shuffledCerebrasKeys) {
        const outcome = await attemptWithStatus((signal) => fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: question }
            ],
            temperature: 0.7,
            max_tokens: 4096
          })
        }), budget);
        if (outcome.__exception) {
          lastError = `Cerebras(${model}) exception: ${outcome.message}`;
          if (outcome.__budgetExhausted)
            return { error: lastError };
          continue;
        }
        if (!outcome.ok) {
          lastError = `Cerebras(${model}) HTTP ${outcome.status}`;
          continue;
        }
        const data = await outcome.json().catch(() => null);
        const answer = data?.choices?.[0]?.message?.content || null;
        if (answer)
          return { answer, provider: `cerebras:${model}` };
        lastError = `Cerebras(${model}): empty response`;
      }
    }
    if (round < MAX_ROTATION_ROUNDS - 1)
      await sleep(400 * (round + 1));
  }
  return { error: lastError };
}
__name(callCerebras, "callCerebras");
async function callCloudflareAI(env, question, systemPrompt, image, budget) {
  if (!env.AI)
    return { error: "Workers AI binding not configured" };
  try {
    const model = image ? "@cf/meta/llama-3.2-11b-vision-instruct" : "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    let input;
    if (image) {
      input = {
        prompt: question || "\u098F\u0987 \u099B\u09AC\u09BF\u099F\u09BF \u09AC\u09BF\u09B6\u09CD\u09B2\u09C7\u09B7\u09A3 \u0995\u09B0\u09CB \u098F\u09AC\u0982 \u09AC\u09BE\u0982\u09B2\u09BE\u09AF\u09BC \u09AC\u09CD\u09AF\u09BE\u0996\u09CD\u09AF\u09BE \u09A6\u09BE\u0993\u0964",
        image: Array.from(base64ToBytes(image.base64)),
        max_tokens: 4096
      };
    } else {
      input = {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ]
      };
    }
    const result = await env.AI.run(model, input);
    const answer = result?.response || result?.result?.response || null;
    return answer ? { answer, provider: "cloudflare-ai" } : { error: "Cloudflare AI: empty response \u2014 " + JSON.stringify(result).slice(0, 200) };
  } catch (e) {
    return { error: `Cloudflare AI exception: ${e?.message || JSON.stringify(e) || String(e)}` };
  }
}
__name(callCloudflareAI, "callCloudflareAI");
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(base64ToBytes, "base64ToBytes");
async function ensureMcqJobTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS mcq_gen_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idempotency_key TEXT UNIQUE NOT NULL,
        pdf_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        mcq_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        system_prompt TEXT NOT NULL,
        json_format TEXT NOT NULL,
        count_min INTEGER NOT NULL,
        count_max INTEGER NOT NULL,
        page_image_r2_key TEXT,
        page_image_mime TEXT,
        result_json TEXT,
        topup_tries INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  try {
    await db.prepare(`ALTER TABLE mcq_gen_jobs ADD COLUMN page_image_r2_key TEXT`).run();
  } catch (_) {
  }
}
__name(ensureMcqJobTable, "ensureMcqJobTable");
async function handleMcqJobCreate(body, env) {
  const apiKey = body.apiKey;
  if (!env.D1_API_KEY || apiKey !== env.D1_API_KEY)
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  const db = env.MULBOI_DB;
  if (!db)
    return jsonResponse({ success: false, error: "D1 binding MULBOI_DB missing" }, 500);
  await ensureMcqJobTable(db);
  const { pdfId, pageNumber, mcqType, systemPrompt, jsonFormat, countMin, countMax, pageImageBase64, pageImageMime } = body;
  if (!pdfId || !pageNumber || !mcqType || !systemPrompt || !countMin || !countMax) {
    return jsonResponse({ success: false, error: "pdfId, pageNumber, mcqType, systemPrompt, countMin, countMax \u09AA\u09CD\u09B0\u09AF\u09BC\u09CB\u099C\u09A8" }, 400);
  }
  const idempotencyKey = `${pdfId}:${pageNumber}:${mcqType}:${countMin}-${countMax}`;
  let r2Key = null;
  if (pageImageBase64 && env.PDF_BUCKET) {
    try {
      r2Key = `mcq-job-images/${pdfId}_${pageNumber}_${Date.now()}.jpg`;
      const bin = Uint8Array.from(atob(pageImageBase64), (c) => c.charCodeAt(0));
      await env.PDF_BUCKET.put(r2Key, bin, { httpMetadata: { contentType: pageImageMime || "image/jpeg" } });
    } catch (_) {
      r2Key = null;
    }
  }
  const existing = await db.prepare(`SELECT * FROM mcq_gen_jobs WHERE idempotency_key = ?`).bind(idempotencyKey).first();
  if (existing && existing.status !== "error") {
    return jsonResponse({ success: true, jobId: existing.id, status: existing.status, reused: true });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existing && existing.status === "error") {
    await db.prepare(`UPDATE mcq_gen_jobs SET status='pending', error=NULL, attempts=0, result_json=NULL,
            page_image_r2_key=?, page_image_mime=?, system_prompt=?, json_format=?, count_min=?, count_max=?, updated_at=? WHERE id=?`).bind(r2Key, pageImageMime || null, systemPrompt, jsonFormat || "", countMin, countMax, now, existing.id).run();
    return jsonResponse({ success: true, jobId: existing.id, status: "pending", reused: false });
  }
  const res = await db.prepare(`INSERT INTO mcq_gen_jobs
        (idempotency_key, pdf_id, page_number, mcq_type, status, system_prompt, json_format, count_min, count_max, page_image_r2_key, page_image_mime, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(idempotencyKey, pdfId, pageNumber, mcqType, systemPrompt, jsonFormat || "", countMin, countMax, r2Key, pageImageMime || null, now, now).run();
  return jsonResponse({ success: true, jobId: res.meta.last_row_id, status: "pending", reused: false });
}
__name(handleMcqJobCreate, "handleMcqJobCreate");
async function handleMcqJobStatus(url, env) {
  const apiKey = url.searchParams.get("apiKey");
  if (!env.D1_API_KEY || apiKey !== env.D1_API_KEY)
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  const db = env.MULBOI_DB;
  if (!db)
    return jsonResponse({ success: false, error: "D1 binding MULBOI_DB missing" }, 500);
  await ensureMcqJobTable(db);
  const jobId = url.searchParams.get("jobId");
  const pdfId = url.searchParams.get("pdfId");
  const consumeId = url.searchParams.get("consumeId");
  if (consumeId) {
    const row = await db.prepare(`SELECT page_image_r2_key FROM mcq_gen_jobs WHERE id = ?`).bind(consumeId).first();
    await db.prepare(`UPDATE mcq_gen_jobs SET status='consumed', updated_at=? WHERE id=?`).bind((/* @__PURE__ */ new Date()).toISOString(), consumeId).run();
    if (row?.page_image_r2_key && env.PDF_BUCKET) {
      try {
        await env.PDF_BUCKET.delete(row.page_image_r2_key);
      } catch (_) {
      }
    }
    return jsonResponse({ success: true });
  }
  if (jobId) {
    const row = await db.prepare(`SELECT id, status, result_json, error, attempts, page_number, mcq_type FROM mcq_gen_jobs WHERE id = ?`).bind(jobId).first();
    if (!row)
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    return jsonResponse({ success: true, job: row });
  }
  if (pdfId) {
    const rows = await db.prepare(`SELECT id, status, page_number, mcq_type, result_json, error FROM mcq_gen_jobs WHERE pdf_id = ? AND status != 'consumed' ORDER BY page_number ASC`).bind(pdfId).all();
    return jsonResponse({ success: true, jobs: rows.results || [] });
  }
  return jsonResponse({ success: false, error: "jobId \u09AC\u09BE pdfId \u09AA\u09CD\u09B0\u09AF\u09BC\u09CB\u099C\u09A8" }, 400);
}
__name(handleMcqJobStatus, "handleMcqJobStatus");
function workerParseAiJson(raw) {
  if (!raw)
    return null;
  let cleaned = raw.split("```").length > 1 ? raw.split("```").filter((_, i) => i % 2 === 1).join("\n") || raw : raw;
  const tryParse = /* @__PURE__ */ __name((s) => {
    if (!s)
      return null;
    try {
      return JSON.parse(s);
    } catch (_) {
    }
    try {
      return JSON.parse(s.replace(/,\s*([\]}])/g, "$1"));
    } catch (_) {
    }
    return null;
  }, "tryParse");
  const extractBalanced = /* @__PURE__ */ __name((s, openCh, closeCh) => {
    const start = s.indexOf(openCh);
    if (start === -1)
      return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      if (s[i] === openCh)
        depth++;
      else if (s[i] === closeCh) {
        depth--;
        if (depth === 0)
          return s.slice(start, i + 1);
      }
    }
    return null;
  }, "extractBalanced");
  let candidate = extractBalanced(cleaned, "[", "]");
  let parsed = tryParse(candidate);
  if (parsed)
    return Array.isArray(parsed) ? parsed : [parsed];
  candidate = extractBalanced(cleaned, "{", "}");
  parsed = tryParse(candidate);
  if (parsed)
    return [parsed];
  return null;
}
__name(workerParseAiJson, "workerParseAiJson");
async function processPendingMcqJobs(env) {
  const db = env.MULBOI_DB;
  if (!db)
    return;
  await ensureMcqJobTable(db);
  try {
    await db.prepare(`ALTER TABLE mcq_gen_jobs ADD COLUMN topup_tries INTEGER NOT NULL DEFAULT 0`).run();
  } catch (_) {
  }
  const MB_JOB_TOPUP_CEILING = 25;
  const pending = await db.prepare(`SELECT * FROM mcq_gen_jobs WHERE status = 'pending' AND attempts < 8 ORDER BY created_at ASC LIMIT 3`).all();
  const rows = pending.results || [];
  for (const job of rows) {
    await db.prepare(`UPDATE mcq_gen_jobs SET status='processing', attempts=attempts+1, updated_at=? WHERE id=?`).bind((/* @__PURE__ */ new Date()).toISOString(), job.id).run();
    try {
      let image = null;
      if (job.page_image_r2_key && env.PDF_BUCKET) {
        const obj = await env.PDF_BUCKET.get(job.page_image_r2_key);
        if (obj) {
          const buf = await obj.arrayBuffer();
          const u8 = new Uint8Array(buf);
          const CHUNK = 32768;
          const chunks = [];
          for (let i = 0; i < u8.length; i += CHUNK)
            chunks.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
          image = { base64: btoa(chunks.join("")), mimeType: job.page_image_mime || "image/jpeg" };
        }
      }
      let accumulated = [];
      if (job.result_json) {
        try {
          accumulated = JSON.parse(job.result_json) || [];
        } catch (_) {
          accumulated = [];
        }
      }
      const need = Math.max(1, job.count_min - accumulated.length);
      const roundPrompt = accumulated.length ? `${job.system_prompt}

\u098F\u0996\u09A8 \u0986\u09B0\u0993 \u09A0\u09BF\u0995 ${need}\u099F\u09BF \u09A8\u09A4\u09C1\u09A8 MCQ \u09AC\u09BE\u09A8\u09BE\u0993 (\u0986\u0997\u09C7 \u09AF\u09BE \u09AC\u09BE\u09A8\u09BE\u09A8\u09CB \u09B9\u09AF\u09BC\u09C7\u099B\u09C7 \u09A4\u09BE\u09B0 \u09A5\u09C7\u0995\u09C7 \u09B8\u09AE\u09CD\u09AA\u09C2\u09B0\u09CD\u09A3 \u09AD\u09BF\u09A8\u09CD\u09A8 \u09AA\u09CD\u09B0\u09B6\u09CD\u09A8 \u2014 \u098F\u0995\u0987 \u09AA\u09CD\u09B0\u09B6\u09CD\u09A8 repeat \u0995\u09B0\u09BE \u09AF\u09BE\u09AC\u09C7 \u09A8\u09BE)\u0964` : job.system_prompt;
      const cronBudget = makeSubrequestBudget();
      const providers = [
        () => callGroq(env, "", roundPrompt, image, true, cronBudget),
        () => callGemini(env, "", roundPrompt, image, cronBudget),
        () => callOpenRouter(env, "", roundPrompt, image, cronBudget),
        () => callCerebras(env, "", roundPrompt, image, cronBudget),
        () => callCloudflareAI(env, "", roundPrompt, image, cronBudget)
      ];
      let answer = null, lastErr = "\u09B8\u09AC provider \u09AC\u09CD\u09AF\u09B0\u09CD\u09A5";
      for (const p of providers) {
        const r = await p();
        if (r && r.answer && r.answer.trim().length > 5) {
          answer = r.answer;
          break;
        }
        if (r?.error)
          lastErr = r.error;
        if (r?.error && /subrequest budget exhausted/.test(r.error))
          break;
      }
      if (!answer)
        throw new Error(lastErr);
      const parsedNew = workerParseAiJson(answer) || [];
      const existingQ = new Set(accumulated.map((m) => (m.question || "").trim()));
      for (const m of parsedNew) {
        if (m && typeof m.question === "string" && !existingQ.has(m.question.trim())) {
          accumulated.push(m);
          existingQ.add(m.question.trim());
        }
      }
      const trimmed = accumulated.length > job.count_max ? accumulated.slice(0, job.count_max) : accumulated;
      const nextTopupTries = (job.topup_tries || 0) + 1;
      if (trimmed.length >= job.count_min) {
        await db.prepare(`UPDATE mcq_gen_jobs SET status='done', result_json=?, updated_at=? WHERE id=?`).bind(JSON.stringify(trimmed), (/* @__PURE__ */ new Date()).toISOString(), job.id).run();
        if (job.page_image_r2_key && env.PDF_BUCKET) {
          try {
            await env.PDF_BUCKET.delete(job.page_image_r2_key);
          } catch (_) {
          }
        }
      } else if (nextTopupTries >= MB_JOB_TOPUP_CEILING) {
        await db.prepare(`UPDATE mcq_gen_jobs SET status='done', result_json=?, topup_tries=?, updated_at=? WHERE id=?`).bind(JSON.stringify(trimmed), nextTopupTries, (/* @__PURE__ */ new Date()).toISOString(), job.id).run();
        if (job.page_image_r2_key && env.PDF_BUCKET) {
          try {
            await env.PDF_BUCKET.delete(job.page_image_r2_key);
          } catch (_) {
          }
        }
      } else {
        await db.prepare(`UPDATE mcq_gen_jobs SET status='pending', result_json=?, topup_tries=?, updated_at=? WHERE id=?`).bind(JSON.stringify(trimmed), nextTopupTries, (/* @__PURE__ */ new Date()).toISOString(), job.id).run();
      }
    } catch (e) {
      const errMsg = String(e?.message || e);
      const permanentlyFailed = job.attempts + 1 >= 8;
      const nextStatus = permanentlyFailed ? "error" : "pending";
      await db.prepare(`UPDATE mcq_gen_jobs SET status=?, error=?, updated_at=? WHERE id=?`).bind(nextStatus, errMsg, (/* @__PURE__ */ new Date()).toISOString(), job.id).run();
      if (permanentlyFailed && job.page_image_r2_key && env.PDF_BUCKET) {
        try {
          await env.PDF_BUCKET.delete(job.page_image_r2_key);
        } catch (_) {
        }
      }
    }
  }
}
__name(processPendingMcqJobs, "processPendingMcqJobs");

// ===================== Web Push (VAPID + aes128gcm), dependency-free =====================
// Sends a browser push notification to one or more subscriptions using only
// the Web Crypto API available in the Workers runtime (no npm deps possible
// here since this file is deployed as a single unbundled script).

function b64urlToBytes(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
__name(b64urlToBytes, "b64urlToBytes");

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(bytesToB64url, "bytesToB64url");

async function buildVapidHeaders(env, endpoint) {
  const pub = env.VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT || "mailto:admin@atlasprep.app";
  const pubBytes = b64urlToBytes(pub);
  const x = pubBytes.slice(1, 33);
  const y = pubBytes.slice(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: bytesToB64url(b64urlToBytes(priv)),
    x: bytesToB64url(x),
    y: bytesToB64url(y),
    ext: true
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1e3);
  const payload = { aud, exp: now + 12 * 3600, sub: subject };
  const enc = /* @__PURE__ */ new TextEncoder();
  const headerB64 = bytesToB64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigDer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput)
  );
  // WebCrypto ECDSA signatures are already raw (r||s) 64 bytes for P-256, not DER.
  const sig = new Uint8Array(sigDer);
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  return {
    Authorization: `vapid t=${jwt}, k=${pub}`,
    "Crypto-Key": `p256ecdsa=${pub}`
  };
}
__name(buildVapidHeaders, "buildVapidHeaders");

// Encrypts the payload per RFC 8291 (aes128gcm content encoding) for a single subscription.
async function encryptPushPayload(payloadText, p256dhB64url, authB64url) {
  const enc = /* @__PURE__ */ new TextEncoder();
  const plaintext = enc.encode(payloadText);

  const userPublicKeyBytes = b64urlToBytes(p256dhB64url);
  const authSecret = b64urlToBytes(authB64url);

  // Ephemeral local ECDH keypair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  const userPublicKey = await crypto.subtle.importKey(
    "raw",
    userPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userPublicKey },
    localKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  const hkdfExtract = /* @__PURE__ */ __name(async (salt, ikm) => {
    const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, salt);
    return new Uint8Array(sig);
  }, "hkdfExtract");
  const hmacSign = /* @__PURE__ */ __name(async (keyBytes, data) => {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  }, "hmacSign");

  const concatBytes = /* @__PURE__ */ __name((...arrs) => {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrs) { out.set(a, off); off += a.length; }
    return out;
  }, "concatBytes");

  // PRK = HMAC-SHA256(auth_secret, ecdh_secret)
  const prk = await hkdfExtract(authSecret, sharedSecret);

  const infoKeyLabel = enc.encode("WebPush: info\0");
  const keyInfo = concatBytes(infoKeyLabel, userPublicKeyBytes, localPublicKeyRaw);
  const ikmSig = await hmacSign(prk, concatBytes(keyInfo, new Uint8Array([1])));
  const ikm = ikmSig.slice(0, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk2 = await hkdfExtract(salt, ikm);

  const cekInfo = enc.encode("Content-Encoding: aes128gcm\0");
  const cekSig = await hmacSign(prk2, concatBytes(cekInfo, new Uint8Array([1])));
  const cek = cekSig.slice(0, 16);

  const nonceInfo = enc.encode("Content-Encoding: nonce\0");
  const nonceSig = await hmacSign(prk2, concatBytes(nonceInfo, new Uint8Array([1])));
  const nonce = nonceSig.slice(0, 12);

  // Padded plaintext: append a single 0x02 delimiter byte (no extra padding needed for short payloads)
  const padded = concatBytes(plaintext, new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  // aes128gcm header: salt(16) | rs(4, uint32 record size) | idlen(1) | keyid(idlen)
  const recordSize = ciphertext.length + 16 + 4 + 1 + localPublicKeyRaw.length;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt, 0);
  const view = new DataView(header.buffer);
  view.setUint32(16, recordSize, false);
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);

  return concatBytes(header, ciphertext);
}
__name(encryptPushPayload, "encryptPushPayload");

async function sendWebPush(env, subscription, payloadObj) {
  const { endpoint, p256dh, auth } = subscription;
  const payloadText = JSON.stringify(payloadObj);
  const body = await encryptPushPayload(payloadText, p256dh, auth);
  const vapidHeaders = await buildVapidHeaders(env, endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...vapidHeaders,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400"
    },
    body
  });
  return { status: res.status, ok: res.ok || res.status === 201 };
}
__name(sendWebPush, "sendWebPush");

// POST /push/send  { apiKey, title, body, url?, userIds?: string[] }
// If userIds is omitted, sends to ALL subscriptions (broadcast, e.g. site-wide notice).
// Auth: same D1_API_KEY used elsewhere in this worker.
async function handlePushSend(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }
  if (!env.PUSH_API_KEY || body.apiKey !== env.PUSH_API_KEY) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return jsonResponse({ success: false, error: "VAPID keys not configured" }, 500);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return jsonResponse({ success: false, error: "Supabase not configured" }, 500);
  }
  const { title, body: msgBody, url: targetUrl, userIds } = body;
  if (!title) {
    return jsonResponse({ success: false, error: "title \u09AA\u09CD\u09B0\u09AF\u09BC\u09CB\u099C\u09A8" }, 400);
  }

  let query = `${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=id,user_id,endpoint,p256dh,auth`;
  if (Array.isArray(userIds) && userIds.length > 0) {
    query += `&user_id=in.(${userIds.join(",")})`;
  }
  const subsRes = await fetch(query, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
  });
  if (!subsRes.ok) {
    return jsonResponse({ success: false, error: "Failed to fetch subscriptions" }, 500);
  }
  const subs = await subsRes.json();

  const payload = { title, body: msgBody || "", url: targetUrl || "/dashboard/announcements" };
  let sent = 0;
  let failed = 0;
  const staleIds = [];

  for (const sub of subs) {
    try {
      const result = await sendWebPush(env, sub, payload);
      if (result.ok) {
        sent++;
      } else if (result.status === 404 || result.status === 410) {
        // Subscription expired/revoked on the browser side — clean it up.
        staleIds.push(sub.id);
        failed++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  if (staleIds.length > 0) {
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${staleIds.join(",")})`, {
        method: "DELETE",
        headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
      });
    } catch (e) { /* best-effort cleanup */ }
  }

  return jsonResponse({ success: true, sent, failed, total: subs.length });
}
__name(handlePushSend, "handlePushSend");

export {
  atlas_ai_proxy_worker_default as default
};
