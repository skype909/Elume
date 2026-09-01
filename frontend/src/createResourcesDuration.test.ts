import { applyLessonPlanDurationDefault, deriveLessonPlanDuration } from "./createResourcesDuration";

const configuredState = (slots: Array<{ id: string; start: string; end: string }>, classIds: Record<string, number | null>) => ({
  timetableConfig: { setupComplete: true },
  schedule: {
    Mon: {
      slots: slots.map((slot) => ({ ...slot, kind: "period" as const })),
      entries: Object.fromEntries(Object.entries(classIds).map(([id, classId]) => [id, { classId }])),
    },
  },
});

describe("deriveLessonPlanDuration", () => {
  test("uses one unique matching timetable duration", () => {
    const state = configuredState(
      [
        { id: "P1", start: "09:00", end: "09:58" },
        { id: "P2", start: "10:15", end: "11:13" },
      ],
      { P1: 4, P2: 4 }
    );

    expect(deriveLessonPlanDuration(state, 4)).toEqual({ minutes: 58, fromTimetable: true });
  });

  test("falls back when matching class periods have different durations", () => {
    const state = configuredState(
      [
        { id: "P1", start: "09:00", end: "09:58" },
        { id: "P2", start: "10:15", end: "11:05" },
      ],
      { P1: 4, P2: 4 }
    );

    expect(deriveLessonPlanDuration(state, 4)).toEqual({ minutes: 60, fromTimetable: false });
  });

  test("falls back without a configured timetable or selected class", () => {
    expect(deriveLessonPlanDuration(null, 4)).toEqual({ minutes: 60, fromTimetable: false });
    expect(deriveLessonPlanDuration(configuredState([{ id: "P1", start: "09:00", end: "09:58" }], { P1: 4 }), null)).toEqual({
      minutes: 60,
      fromTimetable: false,
    });
  });

  test("does not match a class by label and rejects malformed matching times", () => {
    const state = configuredState([{ id: "P1", start: "09:00", end: "09:00" }], { P1: 4 });
    expect(deriveLessonPlanDuration(state, 4)).toEqual({ minutes: 60, fromTimetable: false });
    expect(deriveLessonPlanDuration(configuredState([{ id: "P1", start: "09:00", end: "09:58" }], { P1: 5 }), 4)).toEqual({
      minutes: 60,
      fromTimetable: false,
    });
  });

  test("keeps a manual override during async timetable loading but resets it for a new scope", () => {
    expect(
      applyLessonPlanDurationDefault("class:4", "class:4", { minutes: 45, manuallyEdited: true }, { minutes: 58, fromTimetable: true })
    ).toEqual({ minutes: 45, manuallyEdited: true });

    expect(
      applyLessonPlanDurationDefault("class:4", "class:5", { minutes: 45, manuallyEdited: true }, { minutes: 60, fromTimetable: false })
    ).toEqual({ minutes: 60, manuallyEdited: false });
  });
});
