// Sends real Web Push notifications using the well-tested `web-push` npm
// library (imported directly via Deno's npm: specifier) instead of a
// hand-rolled VAPID/aes128gcm implementation — much less room for a subtle
// crypto bug that causes silent delivery failures.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VAPID_PUBLIC_KEY = "BFL06Cf7jFt5fQNITBDHxr88SIMgus-wtrmabfxZ95QgNlPbmkDH5CV7S5CgzgR99G3NqXFncBN8WpRaXmaOzkE";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@atlasprep.app";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Still supported for trusted server-to-server calls (e.g. another worker)
// that can't send a user JWT — the admin-panel path below uses JWT instead.
const PUSH_API_KEY = Deno.env.get("PUSH_API_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();

    // Two ways to authenticate: a trusted apiKey (server-to-server), OR a
    // logged-in admin's JWT (from the admin panel via supabase.functions.invoke,
    // which automatically attaches the user's session token).
    let authorized = !!PUSH_API_KEY && body.apiKey === PUSH_API_KEY;

    if (!authorized) {
      const authHeader = req.headers.get("Authorization") || "";
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        authorized = !!isAdmin;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { title, body: msgBody, url: targetUrl, userIds } = body;
    if (!title) {
      return new Response(JSON.stringify({ success: false, error: "title প্রয়োজন" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let query = `${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,user_id,endpoint,p256dh,auth`;
    if (Array.isArray(userIds) && userIds.length > 0) {
      query += `&user_id=in.(${userIds.join(",")})`;
    }
    const subsRes = await fetch(query, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const subs = await subsRes.json();

    const payload = JSON.stringify({ title, body: msgBody || "", url: targetUrl || "/dashboard/announcements" });

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];
    const errors: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (e: any) {
        failed++;
        errors.push(`${sub.id}: ${e?.statusCode || ""} ${e?.body || e?.message || e}`);
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    }

    if (staleIds.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${staleIds.join(",")})`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, sent, failed, total: subs.length, errors }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
