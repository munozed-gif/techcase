import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "../arena-v1.jsx";

// Service worker (auto update). Besides the check at load, look for a new version whenever the
// user comes back to the tab (at most every 10 minutes), so a tab or installed app left open
// does not keep running an old version for days.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    let last = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 10 * 60 * 1000) return;
      last = Date.now();
      reg.update().catch(() => {});
    });
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
