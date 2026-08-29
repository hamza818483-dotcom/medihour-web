import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./fonts.css";
import { registerSW } from "virtual:pwa-register";
import ErrorBoundary from "./components/ErrorBoundary";
import { PWASplash } from "./pwa/PWASplash";

// Tag <html> with app-mode vs website-mode so CSS/components can branch
// design without touching routing or logic. Wrapped defensively — must
// never throw, since it runs before React mounts.
try {
  const isStandaloneNow =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  document.documentElement.classList.add(isStandaloneNow ? "pwa-app-mode" : "pwa-web-mode");
} catch {
  // no-op — never block app boot over this
}

let updateSW: (() => void) | undefined;
let pendingReload = false;

function tryApplyUpdate() {
  if (!pendingReload) return;
  // Don't yank the user out of an active class video or exam — wait until
  // the tab is hidden (they switched away) or they're on a safe page.
  const path = window.location.pathname;
  const isSensitive = /\/class\/|\/take-exam\/|\/mock-test\/play|\/quick-practice/.test(path);
  if (document.visibilityState === "hidden" || !isSensitive) {
    window.location.reload();
  }
}

document.addEventListener("visibilitychange", tryApplyUpdate);

// When a new service worker takes control (after a deploy), the open tab's
// in-memory JS is stale — reload once to pick up the fresh bundle. This never
// touches localStorage/session, only refreshes the running code, so login
// stays intact. Guarded against firing twice and against the very first
// activation (which has no "old" controller to replace).
let refreshing = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    pendingReload = true;
    tryApplyUpdate();
  });
}

updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    // Poll for a new service worker every 60s so long-open tabs also catch updates fast
    registration && setInterval(() => registration.update(), 60_000);
  },
  onNeedRefresh() {
    // A new version is ready. Don't reload immediately — that would kick the
    // user out of a class video or exam mid-session. Defer until the tab is
    // hidden or they're on a non-sensitive page.
    pendingReload = true;
    tryApplyUpdate();
  },
});

if (window.matchMedia("(display-mode: standalone)").matches) {
  document.documentElement.classList.add("pwa-standalone");
}

createRoot(document.getElementById("root")!).render(
  <>
    <ErrorBoundary label="PWASplash" fallback={null}>
      <PWASplash />
    </ErrorBoundary>
    <App />
  </>
);
