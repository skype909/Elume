import { formatDashboardDateCard } from "./dashboardDateFormat";

describe("dashboard date card locale formatting", () => {
  const date = new Date(Date.UTC(2026, 8, 4, 23, 7));

  test("keeps the English dashboard card in en-IE", () => {
    const value = formatDashboardDateCard(date, "en");
    expect(value.day).toBe(new Intl.DateTimeFormat("en-IE", { weekday: "long" }).format(date));
    expect(value.date).toBe(new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", year: "numeric" }).format(date));
  });

  test("uses ga-IE for the Gaeilge dashboard card", () => {
    const value = formatDashboardDateCard(date, "ga");
    expect(value.day).toBe(new Intl.DateTimeFormat("ga-IE", { weekday: "long" }).format(date));
    expect(value.date).toBe(new Intl.DateTimeFormat("ga-IE", { day: "numeric", month: "long", year: "numeric" }).format(date));
    expect(value.day).not.toBe(formatDashboardDateCard(date, "en").day);
  });
});
