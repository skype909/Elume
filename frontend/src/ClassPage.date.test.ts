import { formatDublinDateCardParts } from "./dashboardDateFormat";

describe("Class Page date card", () => {
  // 00:02 in Dublin during Irish Summer Time on Saturday 5 September.
  const saturdayInSeptember = new Date("2026-09-04T23:02:00Z");

  test("uses deterministic Irish Dublin-local values in Gaeilge", () => {
    expect(formatDublinDateCardParts(saturdayInSeptember, "ga")).toEqual({
      weekday: "Dé Sathairn",
      day: 5,
      month: "Meán Fómhair",
      year: 2026,
      time: "00:02",
    });
  });

  test("keeps the English Class Page presentation native to en-IE", () => {
    const value = formatDublinDateCardParts(saturdayInSeptember, "en");
    expect(value.weekday).toBe(new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", weekday: "long" }).format(saturdayInSeptember));
    expect(value.month).toBe(new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", month: "long" }).format(saturdayInSeptember));
    expect(value.day).toBe(5);
    expect(value.time).toBe(new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", hour: "numeric", minute: "2-digit", hour12: true }).format(saturdayInSeptember));
  });

  test("stays Irish when ga-IE falls back to English and crosses Dublin DST", () => {
    const nativeDateTimeFormat = Intl.DateTimeFormat;
    const fallbackDateTimeFormat = jest.fn((locales?: string | string[], options?: Intl.DateTimeFormatOptions) => {
      const requested = Array.isArray(locales) ? locales[0] : locales;
      return new nativeDateTimeFormat(requested === "ga-IE" ? "en-US" : locales, options);
    });
    Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: fallbackDateTimeFormat });

    try {
      expect(new Intl.DateTimeFormat("ga-IE").resolvedOptions().locale).toBe("en-US");
      expect(formatDublinDateCardParts(new Date("2026-03-29T01:30:00Z"), "ga")).toEqual({
        weekday: "Dé Domhnaigh",
        day: 29,
        month: "Márta",
        year: 2026,
        time: "02:30",
      });
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: nativeDateTimeFormat });
    }
  });
});
