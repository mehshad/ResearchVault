import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";

// One-time migration from the previous custom theme system (localStorage key
// `theme-mode`) to next-themes (key `theme`), so users keep their dark/light
// choice. next-themes is now the single source of truth for the `.dark` class.
const legacyMode = localStorage.getItem("theme-mode");
if (legacyMode && !localStorage.getItem("theme")) {
  localStorage.setItem("theme", legacyMode);
}
localStorage.removeItem("theme-mode");

createRoot(document.getElementById("root")!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="light"
    enableSystem={false}
    disableTransitionOnChange
  >
    <App />
  </ThemeProvider>
);
