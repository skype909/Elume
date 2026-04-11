export const JUNIOR_CYCLE_SUBJECTS = [
  "Irish",
  "English",
  "Maths",
  "Science",
  "Geography",
  "History",
  "Business",
  "Graphics",
  "French",
  "Spanish",
  "German",
  "Home Economics",
  "Wood Technology",
] as const;

export const SENIOR_CYCLE_SUBJECTS = [
  "Irish",
  "English",
  "Maths",
  "Physics",
  "Biology",
  "Chemistry",
  "Geography",
  "History",
  "French",
  "Applied Maths",
] as const;

export const EXAM_LIBRARY_SUBJECTS = [
  ...JUNIOR_CYCLE_SUBJECTS,
  ...SENIOR_CYCLE_SUBJECTS.filter(
    (subject) =>
      !JUNIOR_CYCLE_SUBJECTS.includes(
        subject as (typeof JUNIOR_CYCLE_SUBJECTS)[number]
      )
  ),
] as const;

export const EXAM_LIBRARY_CYCLES = ["Junior Cycle", "Senior Cycle"] as const;

export type JuniorCycleSubject = (typeof JUNIOR_CYCLE_SUBJECTS)[number];
export type SeniorCycleSubject = (typeof SENIOR_CYCLE_SUBJECTS)[number];
export type ExamLibrarySubject = (typeof EXAM_LIBRARY_SUBJECTS)[number];

export type ExamLibraryItem = {
  id: string;
  cycle: string;
  subject: string;
  level: string;
  year: string;
  title: string;
  path: string;
  file_url: string;
};

export function normalizeExamLibrarySubject(
  value: string | null | undefined
): ExamLibrarySubject {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "irish") return "Irish";
  if (raw === "english") return "English";
  if (raw === "maths" || raw === "math" || raw === "mathematics") return "Maths";
  if (raw === "physics") return "Physics";
  if (raw === "biology") return "Biology";
  if (raw === "chemistry") return "Chemistry";
  if (raw === "geography") return "Geography";
  if (raw === "history") return "History";
  if (raw === "french") return "French";
  if (raw === "science") return "Science";
  if (raw === "business") return "Business";
  if (raw === "graphics") return "Graphics";
  if (raw === "spanish") return "Spanish";
  if (raw === "german") return "German";
  if (raw === "home economics" || raw === "home ec") return "Home Economics";
  if (raw === "wood technology" || raw === "wood tech") return "Wood Technology";
  if (
    raw === "applied maths" ||
    raw === "applied math" ||
    raw === "applied mathematics"
  ) {
    return "Applied Maths";
  }

  return "Maths";
}

export function examLibraryLevelOptions(cycle: string): string[] {
  return cycle === "Senior Cycle"
    ? ["Higher Level", "Ordinary Level"]
    : ["Higher Level", "Ordinary Level", "Common Level"];
}

export function examLibrarySubjectOptions(cycle: string): ExamLibrarySubject[] {
  return cycle === "Senior Cycle"
    ? [...SENIOR_CYCLE_SUBJECTS]
    : [...JUNIOR_CYCLE_SUBJECTS];
}