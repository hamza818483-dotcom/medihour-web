/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// Workbox precache injection point — vite-plugin-pwa (injectManifest) fills this in at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// SPA fallback so deep links still work offline, same behaviour as the old generateSW config.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/omr-api/")) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match("/index.html") as Promise<Response>)
  );
});

// --- Web Push ---
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string; icon?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Medihour", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Medihour";
  const options: NotificationOptions = {
    body: data.body || "",
    icon: data.icon || "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url: data.url || "/dashboard/announcements" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
