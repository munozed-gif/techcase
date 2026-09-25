import { useState, useEffect, useContext, createContext } from "react";
import { supabase } from "../lib/supabase.js";
import { TRANSLATIONS } from "./translations.js";

const LanguageContext = createContext({ lang: "en", setLang: () => {}, t: k => k });

function LanguageProvider({ children, userId, initialLang }) {
  const [lang, setLangState] = useState(() => {
    // Profile language takes priority over anything cached locally
    if (initialLang && TRANSLATIONS[initialLang]) return initialLang;
    try {
      const saved = localStorage.getItem("tc_lang");
      return saved && TRANSLATIONS[saved] ? saved : "en";
    } catch { return "en"; }
  });

  // Apply profile language whenever it becomes available after mount
  useEffect(() => {
    if (!initialLang || !TRANSLATIONS[initialLang]) return;
    setLangState(initialLang);
    try { localStorage.setItem("tc_lang", initialLang); } catch {}
  }, [initialLang]);

  // Fallback DB sync when initialLang is not available (e.g. onboarding screens)
  useEffect(() => {
    if (!userId || initialLang) return;
    supabase.from("users").select("language_pref").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data?.language_pref && TRANSLATIONS[data.language_pref]) {
          setLangState(data.language_pref);
          try { localStorage.setItem("tc_lang", data.language_pref); } catch {}
        }
      });
  }, [userId, initialLang]);

  async function setLang(newLang) {
    if (!TRANSLATIONS[newLang]) return;
    setLangState(newLang);
    try { localStorage.setItem("tc_lang", newLang); } catch {}
    if (userId) {
      await supabase.from("users").update({ language_pref: newLang }).eq("id", userId);
    }
  }

  function t(key) {
    return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en?.[key] ?? key;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

function useT() {
  return useContext(LanguageContext);
}

export { LanguageContext, LanguageProvider, useT };
