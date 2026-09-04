import { formatDashboardDateCard } from "./dashboardDateFormat";

describe("dashboard date card locale formatting", () => {
  const date = new Date("2026-09-04T22:41:00Z");

  test("keeps the English dashboard card in en-IE", () => {
    const value = formatDashboardDateCard(date, "en");
    expect(value.day).toBe(new Intl.DateTimeFormat("en-IE", { weekday: "long" }).format(date));
    expect(value.date).toBe(new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", year: "numeric" }).format(date));
    expect(value.time).toBe("23:41");
  });

  test("uses deterministic Irish weekday and month names for the Gaeilge dashboard card", () => {
    const value = formatDashboardDateCard(date, "ga");
    expect(value.day).toBe("Dé hAoine");
    expect(value.date).toBe("4 Meán Fómhair 2026");
    expect(value.time).toBe("23:41");
    expect(value.day).not.toBe(formatDashboardDateCard(date, "en").day);
  });

  test("keeps Irish output when ga-IE would fall back to English", () => {
    const nativeDateTimeFormat = Intl.DateTimeFormat;
    const fallbackDateTimeFormat = jest.fn((locales?: string | string[], options?: Intl.DateTimeFormatOptions) => {
      const requested = Array.isArray(locales) ? locales[0] : locales;
      return new nativeDateTimeFormat(requested === "ga-IE" ? "en-US" : locales, options);
    });
    Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: fallbackDateTimeFormat });

    try {
      expect(new Intl.DateTimeFormat("ga-IE").resolvedOptions().locale).toBe("en-US");
      expect(formatDashboardDateCard(date, "ga")).toMatchObject({
        day: "Dé hAoine",
        date: "4 Meán Fómhair 2026",
      });
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: nativeDateTimeFormat });
    }
  });

  test("uses Dublin-local values for another weekday, month, and summer-time boundary", () => {
    const summerTimeDate = new Date("2026-03-29T01:30:00Z");
    expect(formatDashboardDateCard(summerTimeDate, "ga")).toEqual({
      day: "Dé Domhnaigh",
      date: "29 Márta 2026",
      time: "02:30",
    });
  });
});
