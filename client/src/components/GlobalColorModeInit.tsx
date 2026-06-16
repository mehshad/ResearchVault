/**
 * GlobalColorModeInit
 *
 * Fetches the admin-configured global default color mode from the server
 * (`system_configurations` key = "color_mode_default") and applies it via
 * next-themes — BUT only when the current user has not yet set their own
 * personal preference (indicated by the `theme-user-set` localStorage flag).
 *
 * This means:
 *  - First-time / never-toggled users get the admin's chosen default.
 *  - Users who have manually clicked the dark/light toggle keep their choice.
 */
import { useEffect } from "react";
import { useTheme } from "next-themes";

export default function GlobalColorModeInit() {
  const { setTheme } = useTheme();

  useEffect(() => {
    // If the user has already set a personal preference, respect it.
    if (localStorage.getItem("theme-user-set") === "true") return;

    fetch("/api/system-configurations/color_mode_default")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((config) => {
        if (!config) return;
        const mode = typeof config.value === "string" ? config.value : config.value?.mode;
        if (mode === "dark" || mode === "light") {
          setTheme(mode);
        }
      })
      .catch(() => {/* silently ignore — default stays */});
  }, [setTheme]);

  return null;
}
