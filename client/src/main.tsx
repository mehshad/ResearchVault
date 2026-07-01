import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";
import { Router } from "wouter";

// One-time migration from the previous custom theme system (localStorage key
// `theme-mode`) to next-themes (key `theme`), so users keep their dark/light
// choice. next-themes is now the single source of truth for the `.dark` class.
const legacyMode = localStorage.getItem("theme-mode");
if (legacyMode && !localStorage.getItem("theme")) {
  localStorage.setItem("theme", legacyMode);
}
localStorage.removeItem("theme-mode");

// APP_BASE_PATH is injected by the server (static.ts) into window.__APP_BASE_PATH__
// when the app is served under a sub-path (e.g. /demo via nginx). This lets
// wouter match routes correctly regardless of the URL prefix.
const basePath = (window as any).__APP_BASE_PATH__ || "";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="light"
    enableSystem={false}
    disableTransitionOnChange
  >
    <Router base={basePath}>
      <App />
    </Router>
  </ThemeProvider>
);
