import type { UiLanguage } from "./i18n/translations";

const DUBLIN_TIME_ZONE = "Europe/Dublin";

const IRISH_WEEKDAYS = [
  "Dé Domhnaigh",
  "Dé Luain",
  "Dé Máirt",
  "Dé Céadaoin",
  "Déardaoin",
  "Dé hAoine",
  "Dé Sathairn",
] as const;

const IRISH_MONTHS = [
  "Eanáir",
  "Feabhra",
  "Márta",
  "Aibreán",
  "Bealtaine",
  "Meitheamh",
  "Iúil",
  "Lúnasa",
  "Meán Fómhair",
  "Deireadh Fómhair",
  "Samhain",
  "Nollaig",
] as const;

function dublinDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-IE", {
    timeZone: DUBLIN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function formatDublinTime(date: Date, hour12: boolean) {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: DUBLIN_TIME_ZONE,
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    ...(hour12 ? { hour12: true } : { hourCycle: "h23" }),
  }).format(date);
}

export function formatDublinDateCardParts(date: Date, language: UiLanguage) {
  const { year, month, day } = dublinDateParts(date);

  if (language === "ga") {
    // Some otherwise modern browsers do not ship Gaeilge ICU data and silently
    // fall back to English for ga-IE. Derive Dublin calendar values numerically,
    // then provide the fixed Irish UI vocabulary ourselves.
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return {
      weekday: IRISH_WEEKDAYS[weekday],
      day,
      month: IRISH_MONTHS[month - 1],
      year,
      time: formatDublinTime(date, false),
    };
  }

  return {
    weekday: new Intl.DateTimeFormat("en-IE", { timeZone: DUBLIN_TIME_ZONE, weekday: "long" }).format(date),
    day,
    month: new Intl.DateTimeFormat("en-IE", {
      timeZone: DUBLIN_TIME_ZONE,
      month: "long",
    }).format(date),
    year,
    time: formatDublinTime(date, true),
  };
}

export function formatDashboardDateCard(date: Date, language: UiLanguage) {
  const parts = formatDublinDateCardParts(date, language);
  return {
    day: parts.weekday,
    date: `${parts.day} ${parts.month} ${parts.year}`,
    time: language === "ga" ? parts.time : formatDublinTime(date, false),
  };
}
