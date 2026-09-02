import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api";
import { translate, type UiLanguage } from "./translations";

type UiLanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: string) => string;
  refreshAccount: () => void;
  isGaeilgeReviewer: boolean;
  saveGaeilgeOverride: (translationKey: string, value: string, baseValue: string) => Promise<void>;
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
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [isGaeilgeReviewer, setIsGaeilgeReviewer] = useState(false);
  const activeAccountKeyRef = useRef(accountKey);

  const refreshAccount = useCallback(() => {
    const nextAccountKey = currentAccountKey();
    activeAccountKeyRef.current = nextAccountKey;
    setOverrides({});
    setIsGaeilgeReviewer(false);
    setAccountKey(nextAccountKey);
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

  useEffect(() => {
    let cancelled = false;
    const requestAccountKey = accountKey;
    setOverrides({});
    setIsGaeilgeReviewer(false);

    if (preference.language !== "ga" || accountKey === "anonymous") return () => { cancelled = true; };

    void apiFetch("/ui-translations/ga")
      .then((payload) => {
        if (cancelled || activeAccountKeyRef.current !== requestAccountKey) return;
        setOverrides(payload?.overrides && typeof payload.overrides === "object" ? payload.overrides : {});
        setIsGaeilgeReviewer(payload?.is_gaeilge_reviewer === true);
      })
      .catch(() => {
        // Shared corrections are optional enhancement data; static Gaeilge remains available.
      });

    return () => { cancelled = true; };
  }, [accountKey, preference.language]);

  const value = useMemo<UiLanguageContextValue>(() => ({
    language: preference.language,
    setLanguage: (language) => setPreference({ accountKey, language }),
    t: (key) => preference.language === "ga" ? overrides[key] ?? translate("ga", key) : translate("en", key),
    refreshAccount,
    isGaeilgeReviewer,
    saveGaeilgeOverride: async (translationKey, value, baseValue) => {
      const saved = await apiFetch(`/ui-translations/ga/${encodeURIComponent(translationKey)}`, {
        method: "PUT",
        body: { value, base_value: baseValue },
      });
      if (typeof saved?.value !== "string") throw new Error("Could not save the Gaeilge translation.");
      setOverrides((current) => ({ ...current, [translationKey]: saved.value }));
    },
  }), [accountKey, isGaeilgeReviewer, overrides, preference.language, refreshAccount]);

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage() {
  const value = useContext(UiLanguageContext);
  if (!value) throw new Error("useUiLanguage must be used inside UiLanguageProvider");
  return value;
}
