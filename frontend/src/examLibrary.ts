export const EXAM_LIBRARY_SUBJECTS = ["Irish", "English", "Maths", "Physics"] as const;
export const EXAM_LIBRARY_CYCLES = ["Junior Cycle", "Senior Cycle"] as const;

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

export function normalizeExamLibrarySubject(value: string | null | undefined): ExamLibrarySubject {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "irish") return "Irish";
  if (raw === "english") return "English";
  if (raw === "maths" || raw === "math" || raw === "mathematics") return "Maths";
  if (raw === "physics") return "Physics";
  return "Maths";
}

export function examLibraryLevelOptions(cycle: string): string[] {
  return cycle === "Senior Cycle"
    ? ["Higher Level", "Ordinary Level"]
    : ["Higher Level", "Common Level"];
}
