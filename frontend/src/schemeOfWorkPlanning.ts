import type { TeacherTimetableState } from "./createResourcesDuration";

export type WeeklyClass = { id: string; weekday?: number | null; label: string; minutes: number };
export type ClosureRange = { id: string; start: string; end: string; label?: string };
export type TeachingCapacity = {
  lessons: number;
  minutes: number;
  estimated: boolean;
  warnings: string[];
};

const dayNumbers: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function asDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function slotMinutes(start: string, end: string): number | null {
  if (!HHMM.test(start) || !HHMM.test(end)) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes > 0 ? minutes : null;
}

/** Read-only timetable import. It never writes to Teacher Admin state. */
export function weeklyClassesFromTimetable(state: TeacherTimetableState | null, classId: number | null | undefined): WeeklyClass[] {
  if (!state?.timetableConfig?.setupComplete || !Number.isInteger(classId) || !classId || classId <= 0) return [];
  const result: WeeklyClass[] = [];
  for (const [day, schedule] of Object.entries(state.schedule ?? {})) {
    for (const slot of schedule?.slots ?? []) {
      if (slot.kind !== "period" || schedule.entries?.[slot.id]?.classId !== classId) continue;
      const minutes = slotMinutes(slot.start, slot.end);
      if (!minutes) continue;
      result.push({ id: `${day}-${slot.id}`, weekday: dayNumbers[day] ?? null, label: `${day} ${slot.start}-${slot.end}`, minutes });
    }
  }
  return result;
}

export function calculateTeachingCapacity(startValue: string, endValue: string, weekly: WeeklyClass[], closures: ClosureRange[]): TeachingCapacity {
  const start = asDate(startValue);
  const end = asDate(endValue);
  const usable = weekly.filter((item) => Number.isInteger(item.minutes) && item.minutes > 0);
  const warnings: string[] = [];
  if (!start || !end || end < start) return { lessons: 0, minutes: 0, estimated: false, warnings: ["Confirm a valid academic-year start and end date."] };
  if (!usable.length) return { lessons: 0, minutes: 0, estimated: false, warnings: ["Add at least one weekly class before generating a full-year plan."] };

  const closureDays = new Set<string>();
  for (const closure of closures) {
    const from = asDate(closure.start);
    const to = asDate(closure.end);
    if (!from || !to || to < from) { warnings.push("One closure range needs valid start and end dates."); continue; }
    for (let date = new Date(from); date <= to; date.setUTCDate(date.getUTCDate() + 1)) closureDays.add(dateKey(date));
  }

  const withWeekday = usable.filter((item) => item.weekday && item.weekday >= 1 && item.weekday <= 5);
  if (withWeekday.length !== usable.length) {
    warnings.push("Capacity is an estimate because one or more weekly classes have no weekday. Add weekdays to apply closures precisely.");
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    const weeks = days / 7;
    const weeklyMinutes = usable.reduce((total, item) => total + item.minutes, 0);
    const closureWeeks = closureDays.size / 5;
    return { lessons: Math.max(0, Math.round(usable.length * Math.max(0, weeks - closureWeeks))), minutes: Math.max(0, Math.round(weeklyMinutes * Math.max(0, weeks - closureWeeks))), estimated: true, warnings };
  }

  let lessons = 0;
  let minutes = 0;
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (closureDays.has(dateKey(date))) continue;
    const weekday = date.getUTCDay();
    for (const lesson of withWeekday) {
      if (lesson.weekday === weekday) { lessons += 1; minutes += lesson.minutes; }
    }
  }
  return { lessons, minutes, estimated: false, warnings };
}
