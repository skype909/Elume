import type { UiLanguage } from "./i18n/translations";

export function formatDashboardDateCard(date: Date, language: UiLanguage) {
  const locale = language === "ga" ? "ga-IE" : "en-IE";
  return {
    day: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date),
  };
}
