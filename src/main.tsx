import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./fonts.css";

// PWA fully deactivated: unregister any leftover service worker from
// previously-installed instances so they fall back to a plain website tab.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);

