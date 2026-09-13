import { calculateTeachingCapacity, weeklyClassesFromTimetable } from "./schemeOfWorkPlanning";

describe("scheme of work capacity", () => {
  test("imports unequal periods without changing the timetable and calculates partial weeks", () => {
    const weekly = weeklyClassesFromTimetable({ timetableConfig: { setupComplete: true }, schedule: { Mon: { slots: [{ id: "a", kind: "period", start: "09:00", end: "09:40" }], entries: { a: { classId: 7 } } }, Wed: { slots: [{ id: "b", kind: "period", start: "09:00", end: "10:20" }], entries: { b: { classId: 7 } } } } }, 7);
    expect(weekly.map((item) => item.minutes)).toEqual([40, 80]);
    expect(calculateTeachingCapacity("2026-09-07", "2026-09-16", weekly, []).minutes).toBe(240);
  });

  test("does not double subtract overlapping closures", () => {
    const weekly = [{ id: "m", weekday: 1, label: "Monday", minutes: 60 }];
    const capacity = calculateTeachingCapacity("2026-09-07", "2026-09-21", weekly, [{ id: "a", start: "2026-09-14", end: "2026-09-16" }, { id: "b", start: "2026-09-15", end: "2026-09-18" }]);
    expect(capacity.lessons).toBe(2);
    expect(capacity.minutes).toBe(120);
  });
});
