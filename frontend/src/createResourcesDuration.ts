export type TimetableSlot = {
  id: string;
  kind: "period" | "break" | "lunch";
  start: string;
  end: string;
};

export type TimetableEntry = {
  classId: number | null;
};

export type TeacherTimetableState = {
  timetableConfig?: { setupComplete?: boolean };
  schedule?: Record<string, { slots?: TimetableSlot[]; entries?: Record<string, TimetableEntry> }>;
};

export type LessonDurationDefault = {
  minutes: number;
  fromTimetable: boolean;
};

export type LessonDurationSelection = {
  minutes: number;
  manuallyEdited: boolean;
};

const DEFAULT_LESSON_DURATION_MINUTES = 60;
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(value: string): number | null {
  if (!HHMM.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function deriveLessonPlanDuration(
  timetableState: TeacherTimetableState | null,
  classId: number | null | undefined
): LessonDurationDefault {
  if (!timetableState?.timetableConfig?.setupComplete || !Number.isInteger(classId) || (classId ?? 0) <= 0) {
    return { minutes: DEFAULT_LESSON_DURATION_MINUTES, fromTimetable: false };
  }

  const durations = new Set<number>();
  let foundInvalidMatch = false;

  for (const daySchedule of Object.values(timetableState.schedule ?? {})) {
    for (const slot of daySchedule?.slots ?? []) {
      const entry = daySchedule?.entries?.[slot.id];
      if (slot.kind !== "period" || entry?.classId !== classId) continue;

      const start = toMinutes(slot.start);
      const end = toMinutes(slot.end);
      if (start === null || end === null || end <= start) {
        foundInvalidMatch = true;
        continue;
      }
      durations.add(end - start);
    }
  }

  if (!foundInvalidMatch && durations.size === 1) {
    return { minutes: Array.from(durations)[0], fromTimetable: true };
  }
  return { minutes: DEFAULT_LESSON_DURATION_MINUTES, fromTimetable: false };
}

export function applyLessonPlanDurationDefault(
  previousScopeKey: string | null,
  scopeKey: string,
  current: LessonDurationSelection,
  derived: LessonDurationDefault
): LessonDurationSelection {
  if (previousScopeKey !== scopeKey) {
    return { minutes: derived.minutes, manuallyEdited: false };
  }
  if (current.manuallyEdited) return current;
  return { minutes: derived.minutes, manuallyEdited: false };
}
