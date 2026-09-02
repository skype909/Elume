import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate, type UiLanguage } from "./translations";

type UiLanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: string) => string;
  refreshAccount: () => void;
};

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

function currentAccountKey(): string {
  try {
    const token = localStorage.getItem("elume_token");
    if (!token) return "anonymous";
    const payload = JSON.parse(atob(token.split(".")[1]));
    const email = payload?.email ?? payload?.sub ?? payload?.username;
    return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : "anonymous";
  } catch {
    return "anonymous";
  }
}

function storageKey(accountKey: string) {
  return `elume_ui_language_v1:${accountKey}`;
}

function storedLanguage(accountKey: string): UiLanguage {
  try {
    return localStorage.getItem(storageKey(accountKey)) === "ga" ? "ga" : "en";
  } catch {
    return "en";
  }
}

export function UiLanguageProvider({ children }: { children: React.ReactNode }) {
  const [accountKey, setAccountKey] = useState(currentAccountKey);
  const [preference, setPreference] = useState(() => ({ accountKey, language: storedLanguage(accountKey) }));

  const refreshAccount = useCallback(() => {
    setAccountKey(currentAccountKey());
  }, []);

  useEffect(() => {
    if (preference.accountKey !== accountKey) {
      setPreference({ accountKey, language: storedLanguage(accountKey) });
    }
  }, [accountKey, preference.accountKey]);

  useEffect(() => {
    if (preference.accountKey !== accountKey) return;
    try {
      localStorage.setItem(storageKey(accountKey), preference.language);
    } catch {
      // Language choice remains available for this session if storage is unavailable.
    }
  }, [accountKey, preference]);

  const value = useMemo<UiLanguageContextValue>(() => ({
    language: preference.language,
    setLanguage: (language) => setPreference({ accountKey, language }),
    t: (key) => translate(preference.language, key),
    refreshAccount,
  }), [accountKey, preference.language, refreshAccount]);

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage() {
  const value = useContext(UiLanguageContext);
  if (!value) throw new Error("useUiLanguage must be used inside UiLanguageProvider");
  return value;
}
