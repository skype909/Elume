import { proposeCalendarFromExtractedText } from "./schemeOfWorkCalendar";

describe("school-calendar extraction review", () => {
  test("proposes sourced closures from unambiguous dates without inventing a year", () => {
    const result = proposeCalendarFromExtractedText("Academic year: 2026-09-01 to 2027-06-25. Christmas closure 2026-12-21 to 2027-01-04. Exams 09/05/2027 to 20/05/2027.", "calendar.pdf");
    expect(result.startDate).toBe("2026-09-01");
    expect(result.endDate).toBe("2027-06-25");
    expect(result.closures).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: "2026-12-21", end: "2027-01-04", label: expect.stringContaining("calendar.pdf") }),
      expect.objectContaining({ start: "2027-05-09", end: "2027-05-20", label: expect.stringContaining("Exam") }),
    ]));
  });

  test("flags ambiguous dates for teacher correction", () => {
    const result = proposeCalendarFromExtractedText("Mid-term: 27/10 to 31/10", "photo.jpg");
    expect(result.warnings.join(" ")).toMatch(/no year|No unambiguous/i);
    expect(result.closures).toEqual([]);
  });
});
