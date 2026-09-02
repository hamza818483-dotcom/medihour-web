// Meta Conversions API (CAPI) — server-side event forwarder.
//
// Called two ways:
//  1. Directly from the client (supabase.functions.invoke) for
//     CompleteRegistration right after signup succeeds.
//  2. From a Postgres trigger (pg_net.http_post) the moment a
//     payment_requests row is verified 'approved' by an admin — this is the
//     ONLY path that ever sends a Purchase event, so Purchase can never be
//     spoofed by a client just visiting a "thank you" page.
//
// Required secrets (set via `supabase secrets set`):
//   META_PIXEL_ID             - same Pixel ID used in the browser
//   META_CAPI_ACCESS_TOKEN    - Conversions API access token from Events Manager
//   META_CAPI_TEST_EVENT_CODE - optional, for Meta Events Manager "Test Events" tab

import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface CapiRequestBody {
  event_name: "CompleteRegistration" | "Purchase" | "ViewContent" | "InitiateCheckout" | "PageView";
  event_id?: string;
  event_source_url?: string;
  user?: {
    email?: string;
    phone?: string;
    fbp?: string;
    fbc?: string;
  };
  purchase?: {
    content_ids?: string[];
    content_name?: string;
    value?: number;
    currency?: string;
  };
  utm?: Record<string, string | null | undefined>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Only POST allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const pixelId = Deno.env.get("META_PIXEL_ID");
    const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
    const testEventCode = Deno.env.get("META_CAPI_TEST_EVENT_CODE");

    if (!pixelId || !accessToken) {
      // Not configured yet — accept the request but no-op, so callers
      // (especially the DB trigger) don't error out before setup is done.
      return new Response(JSON.stringify({ success: false, skipped: true, reason: "Meta CAPI not configured" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body: CapiRequestBody = await req.json();

    const userData: Record<string, unknown> = {};
    if (body.user?.email) userData.em = [await sha256Hex(body.user.email)];
    if (body.user?.phone) {
      const digitsOnly = body.user.phone.replace(/[^0-9]/g, "");
      // Meta expects phone in E.164-ish digits (country code + number, no +).
      const normalized = digitsOnly.startsWith("88") ? digitsOnly : `88${digitsOnly.replace(/^0/, "")}`;
      userData.ph = [await sha256Hex(normalized)];
    }
    if (body.user?.fbp) userData.fbp = body.user.fbp;
    if (body.user?.fbc) userData.fbc = body.user.fbc;

    const customData: Record<string, unknown> = {};
    if (body.purchase) {
      if (body.purchase.content_ids) customData.content_ids = body.purchase.content_ids;
      if (body.purchase.content_name) customData.content_name = body.purchase.content_name;
      if (typeof body.purchase.value === "number") customData.value = body.purchase.value;
      customData.currency = body.purchase.currency || "BDT";
    }

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: body.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url,
          action_source: "website",
          user_data: userData,
          custom_data: Object.keys(customData).length ? customData : undefined,
        },
      ],
    };

    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const metaResult = await metaRes.json();

    return new Response(JSON.stringify({ success: metaRes.ok, meta: metaResult }), {
      status: metaRes.ok ? 200 : 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
