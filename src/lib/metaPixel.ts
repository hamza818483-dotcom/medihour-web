// Meta (Facebook/Instagram) Pixel integration.
//
// Handles:
//  - Pixel script injection + init (only if VITE_META_PIXEL_ID is set)
//  - Standard event tracking (PageView, ViewContent, CompleteRegistration,
//    InitiateCheckout, Purchase) with a shared event_id so the browser
//    Pixel event and the server-side CAPI event can be deduplicated by Meta.
//  - UTM parameter capture + persistence (localStorage) so attribution
//    survives across pages (landing -> course page -> register -> buy).
//
// NOTE: Purchase is intentionally NOT fired from any "thank you" / success
// page component. It is only ever fired server-side (via the DB trigger ->
// meta-capi edge function) once an admin approves a payment_requests row.
// The browser-side `trackPurchaseBrowserSide` helper exists only to fire the
// matching browser-pixel Purchase event using the SAME event_id, and is only
// called right after we've confirmed (by re-fetching payment_requests) that
// the specific request is actually 'approved' — see CourseBuy / dashboard
// payment status polling for the call site.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

const UTM_STORAGE_KEY = "mh_utm_params";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Injects the Meta Pixel base code once. No-op if no Pixel ID is configured. */
export function initMetaPixel() {
  if (!META_PIXEL_ID) return;
  if (typeof window === "undefined") return;
  if (window.fbq) return; // already initialized

  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  window.fbq?.("init", META_PIXEL_ID);
  captureUtmParams();
}

/** Generates a random event_id used to dedupe browser Pixel + server CAPI events. */
export function generateEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mh_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Fires a standard Pixel event from the browser, tagged with event_id for CAPI dedup. */
export function trackPixelEvent(
  eventName: "PageView" | "ViewContent" | "CompleteRegistration" | "InitiateCheckout" | "Purchase",
  params: Record<string, unknown> = {},
  eventId?: string
) {
  if (!META_PIXEL_ID || typeof window === "undefined" || !window.fbq) return;
  const opts = eventId ? { eventID: eventId } : undefined;
  window.fbq("track", eventName, params, opts);
}

/** Reads utm_* from the current URL and persists them (first-touch wins) to localStorage. */
export function captureUtmParams(): UtmParams {
  if (typeof window === "undefined") return {};
  const url = new URL(window.location.href);
  const found: UtmParams = {};
  let hasAny = false;
  for (const key of UTM_KEYS) {
    const val = url.searchParams.get(key);
    if (val) {
      found[key] = val;
      hasAny = true;
    }
  }

  const existing = getStoredUtmParams();
  if (hasAny) {
    // Fresh UTM params on this visit override stale ones (last click wins
    // for attribution to whichever campaign brought them back).
    const merged = { ...existing, ...found };
    localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }
  return existing;
}

export function getStoredUtmParams(): UtmParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(UTM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Reads the _fbp / _fbc cookies Meta's own Pixel script sets, for CAPI matching. */
export function getFacebookCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const cookies = document.cookie.split(";").reduce<Record<string, string>>((acc, c) => {
    const [k, ...v] = c.trim().split("=");
    acc[k] = v.join("=");
    return acc;
  }, {});
  return { fbp: cookies["_fbp"], fbc: cookies["_fbc"] };
}
