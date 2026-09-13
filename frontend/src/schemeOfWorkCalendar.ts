import type { ClosureRange } from "./schemeOfWorkPlanning";

export type CalendarProposal = {
  startDate?: string;
  endDate?: string;
  closures: ClosureRange[];
  warnings: string[];
};

const ISO = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const UK_DATE = /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g;
const RANGE = /((?:20\d{2}-\d{2}-\d{2})|(?:\d{1,2}[/.]\d{1,2}[/.]20\d{2}))\s*(?:to|[-–])\s*((?:20\d{2}-\d{2}-\d{2})|(?:\d{1,2}[/.]\d{1,2}[/.]20\d{2}))/gi;

function isoFromToken(token: string): string | null {
  const iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return token;
  const uk = /^(\d{1,2})[/.](\d{1,2})[/.](20\d{2})$/.exec(token);
  if (!uk) return null;
  const [, day, month, year] = uk;
  const d = Number(day), m = Number(month);
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** A deliberately conservative date reader. It never guesses a missing year. */
export function proposeCalendarFromExtractedText(text: string, sourceName: string): CalendarProposal {
  const all: string[] = [];
  for (const match of text.matchAll(ISO)) all.push(`${match[1]}-${match[2]}-${match[3]}`);
  for (const match of text.matchAll(UK_DATE)) all.push(isoFromToken(match[0]) || "");
  const dates = [...new Set(all.filter(Boolean))].sort();
  const closures: ClosureRange[] = [];
  for (const match of text.matchAll(RANGE)) {
    const start = isoFromToken(match[1]);
    const end = isoFromToken(match[2]);
    if (!start || !end || end < start) continue;
    const context = text.slice(Math.max(0, (match.index || 0) - 48), (match.index || 0) + match[0].length + 48).replace(/\s+/g, " ").trim();
    const label = /exam/i.test(context) ? "Exam period" : /holiday|break|closure|closed/i.test(context) ? "School closure" : "Calendar exclusion";
    closures.push({ id: `calendar-${sourceName}-${start}-${end}`, start, end, label: `${label} · ${sourceName}` });
  }
  const warnings: string[] = [];
  if (/\b\d{1,2}[/.]\d{1,2}\b/.test(text)) warnings.push(`Some dates in ${sourceName} have no year. Confirm them manually before using capacity.`);
  if (!dates.length) warnings.push(`No unambiguous full dates could be read from ${sourceName}. Enter or correct the calendar dates manually.`);
  if (dates.length && dates.length < 2) warnings.push(`Only one full date was found in ${sourceName}. Confirm academic-year boundaries manually.`);
  return { startDate: dates[0], endDate: dates.length > 1 ? dates[dates.length - 1] : undefined, closures, warnings };
}
