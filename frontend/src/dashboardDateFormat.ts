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

export function formatDashboardDateCard(date: Date, language: UiLanguage) {
  const time = new Intl.DateTimeFormat("en-IE", {
    timeZone: DUBLIN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  if (language === "ga") {
    // Some otherwise modern browsers do not ship Gaeilge ICU data and silently
    // fall back to English for ga-IE. Derive Dublin calendar values numerically,
    // then provide the fixed Irish UI vocabulary ourselves.
    const { year, month, day } = dublinDateParts(date);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return {
      day: IRISH_WEEKDAYS[weekday],
      date: `${day} ${IRISH_MONTHS[month - 1]} ${year}`,
      time,
    };
  }

  return {
    day: new Intl.DateTimeFormat("en-IE", { timeZone: DUBLIN_TIME_ZONE, weekday: "long" }).format(date),
    date: new Intl.DateTimeFormat("en-IE", {
      timeZone: DUBLIN_TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
    time,
  };
}
