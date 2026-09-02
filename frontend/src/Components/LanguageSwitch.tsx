import { useUiLanguage } from "../i18n/UiLanguageContext";

export default function LanguageSwitch() {
  const { language, setLanguage, t } = useUiLanguage();

  return (
    <div className="inline-flex rounded-xl border-2 border-emerald-100 bg-emerald-50 p-0.5 shadow-sm" aria-label="Language">
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${language === "en" ? "bg-white text-emerald-900 shadow-sm" : "text-emerald-800 hover:bg-white/70"}`}
      >
        {t("language.english")}
      </button>
      <button
        type="button"
        onClick={() => setLanguage("ga")}
        aria-pressed={language === "ga"}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${language === "ga" ? "bg-white text-emerald-900 shadow-sm" : "text-emerald-800 hover:bg-white/70"}`}
      >
        {t("language.gaeilge")}
      </button>
    </div>
  );
}
