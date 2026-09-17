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

function preferenceStorageKey(accountKey: string) { return `elume_ui_language_v2:${accountKey}`; }
type StoredPreference = { language: UiLanguage; updatedAt: number | null };
function storedPreference(accountKey: string): StoredPreference {
  try { const raw = localStorage.getItem(preferenceStorageKey(accountKey)); const parsed = raw && JSON.parse(raw); if (parsed && (parsed.language === "en" || parsed.language === "ga")) return { language: parsed.language, updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null }; return { language: localStorage.getItem(storageKey(accountKey)) === "ga" ? "ga" : "en", updatedAt: null }; } catch { return { language: "en", updatedAt: null }; }
}
function hasStoredLanguage(accountKey: string) { try { return localStorage.getItem(storageKey(accountKey)) !== null || localStorage.getItem(preferenceStorageKey(accountKey)) !== null; } catch { return false; } }

function storedLanguage(accountKey: string): UiLanguage {
  try {
    return localStorage.getItem(storageKey(accountKey)) === "ga" ? "ga" : "en";
  } catch {
    return "en";
  }
}

export function UiLanguageProvider({ children }: { children: React.ReactNode }) {
  const [accountKey, setAccountKey] = useState(currentAccountKey);
  const [preference, setPreference] = useState(() => ({ accountKey, ...storedPreference(accountKey) }));
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
      setPreference({ accountKey, ...storedPreference(accountKey) });
    }
  }, [accountKey, preference.accountKey]);

  useEffect(() => {
    if (accountKey === "anonymous" || preference.accountKey !== accountKey) return;
    let cancelled = false;
    void apiFetch("/auth/me").then((account) => {
      if (cancelled || activeAccountKeyRef.current !== accountKey) return;
      const language: UiLanguage = account?.ui_language === "ga" ? "ga" : "en";
      const updatedAt = Date.parse(account?.ui_language_updated_at || "");
      if (Number.isFinite(updatedAt)) setPreference((current) => current.accountKey === accountKey ? { accountKey, language, updatedAt } : current);
      else if (hasStoredLanguage(accountKey)) void apiFetch("/auth/preferences/ui-language", { method: "PUT", body: { language: preference.language } }).then((saved) => !cancelled && setPreference({ accountKey, language: preference.language, updatedAt: Date.parse(saved?.ui_language_updated_at) || Date.now() })).catch(() => undefined);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountKey, preference.accountKey, preference.language]);

  useEffect(() => {
    if (preference.accountKey !== accountKey) return;
    try {
      localStorage.setItem(storageKey(accountKey), preference.language);
      localStorage.setItem(preferenceStorageKey(accountKey), JSON.stringify({ language: preference.language, updatedAt: preference.updatedAt }));
    } catch {
      // Language choice remains available for this session if storage is unavailable.
    }
  }, [accountKey, preference]);

  useEffect(() => {
    let cancelled = false;
    const requestAccountKey = accountKey;
    setOverrides({});
    setIsGaeilgeReviewer(false);

    if (preference.language !== "ga") return () => { cancelled = true; };

    const endpoint = accountKey === "anonymous" ? "/public/ui-translations/ga" : "/ui-translations/ga";
    void apiFetch(endpoint)
      .then((payload) => {
        if (cancelled || activeAccountKeyRef.current !== requestAccountKey) return;
        setOverrides(payload?.overrides && typeof payload.overrides === "object" ? payload.overrides : {});
        setIsGaeilgeReviewer(accountKey !== "anonymous" && payload?.is_gaeilge_reviewer === true);
      })
      .catch(() => {
        // Shared corrections are optional enhancement data; static Gaeilge remains available.
      });

    return () => { cancelled = true; };
  }, [accountKey, preference.language]);

  const value = useMemo<UiLanguageContextValue>(() => ({
    language: preference.language,
    setLanguage: (language) => { setPreference({ accountKey, language, updatedAt: Date.now() }); if (accountKey !== "anonymous") void apiFetch("/auth/preferences/ui-language", { method: "PUT", body: { language } }).catch(() => undefined); },
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
