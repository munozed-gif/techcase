import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

const ThemeCtx = createContext({ isDark: true, theme: "dark", setTheme: () => {} });

export function ThemeProvider({ initialTheme, userId, children }) {
  const [theme, setThemeState] = useState(() => {
    // localStorage is the fastest source — no flash
    try { return localStorage.getItem("ui_theme") ?? initialTheme ?? "dark"; }
    catch { return initialTheme ?? "dark"; }
  });

  // Sync from profile once auth loads (handles cross-device)
  useEffect(() => {
    if (initialTheme && initialTheme !== theme) {
      setThemeState(initialTheme);
      try { localStorage.setItem("ui_theme", initialTheme); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTheme]);

  // Apply class to <html> so every CSS override in index.css works
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "dark") {
      el.classList.add("arena-dark");
    } else {
      el.classList.remove("arena-dark");
    }
  }, [theme]);

  async function setTheme(t) {
    setThemeState(t);
    try { localStorage.setItem("ui_theme", t); } catch {}
    if (userId) {
      await supabase.from("users").update({ ui_theme: t }).eq("id", userId);
    }
  }

  return (
    <ThemeCtx.Provider value={{ isDark: theme !== "light", theme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
