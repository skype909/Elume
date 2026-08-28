export const STUDENT_CLASSES_STORAGE_KEY = "elume_student_classes_v1";

export type RememberedStudentClass = {
  classCode: string;
  className?: string;
  subject?: string;
  lastVisited: number;
};

function normaliseClassCode(value: unknown) {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "";
}

export function readRememberedStudentClasses(): RememberedStudentClass[] {
  try {
    const raw = localStorage.getItem(STUDENT_CLASSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): RememberedStudentClass | null => {
        const classCode = normaliseClassCode(item?.classCode);
        if (!classCode || typeof item?.lastVisited !== "number") return null;
        return {
          classCode,
          className: typeof item.className === "string" ? item.className.slice(0, 120) : undefined,
          subject: typeof item.subject === "string" ? item.subject.slice(0, 120) : undefined,
          lastVisited: item.lastVisited,
        };
      })
      .filter((item): item is RememberedStudentClass => item !== null)
      .sort((a, b) => b.lastVisited - a.lastVisited)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function rememberStudentClass(next: Omit<RememberedStudentClass, "lastVisited"> & { lastVisited?: number }) {
  const classCode = normaliseClassCode(next.classCode);
  if (!classCode) return;

  try {
    const existing = readRememberedStudentClasses();
    const previous = existing.find((item) => item.classCode === classCode);
    const item: RememberedStudentClass = {
      classCode,
      className: next.className?.trim() || previous?.className,
      subject: next.subject?.trim() || previous?.subject,
      lastVisited: next.lastVisited ?? Date.now(),
    };
    localStorage.setItem(
      STUDENT_CLASSES_STORAGE_KEY,
      JSON.stringify([item, ...existing.filter((entry) => entry.classCode !== classCode)].slice(0, 12))
    );
  } catch {
    // Local storage can be unavailable in private/restricted browser modes.
  }
}

export function removeRememberedStudentClass(classCode: string) {
  try {
    const next = readRememberedStudentClasses().filter((item) => item.classCode !== normaliseClassCode(classCode));
    localStorage.setItem(STUDENT_CLASSES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
}
