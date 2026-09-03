export const CLASS_COLOUR_OPTIONS = [
  { key: "emerald", name: "Emerald", backgroundClass: "bg-emerald-500", ringClass: "ring-emerald-200" },
  { key: "teal", name: "Teal", backgroundClass: "bg-teal-500", ringClass: "ring-teal-200" },
  { key: "cyan", name: "Cyan", backgroundClass: "bg-cyan-500", ringClass: "ring-cyan-200" },
  { key: "sky", name: "Sky", backgroundClass: "bg-sky-500", ringClass: "ring-sky-200" },
  { key: "blue", name: "Blue", backgroundClass: "bg-blue-500", ringClass: "ring-blue-200" },
  { key: "indigo", name: "Indigo", backgroundClass: "bg-indigo-500", ringClass: "ring-indigo-200" },
  { key: "violet", name: "Violet", backgroundClass: "bg-violet-500", ringClass: "ring-violet-200" },
  { key: "fuchsia", name: "Fuchsia", backgroundClass: "bg-fuchsia-500", ringClass: "ring-fuchsia-200" },
  { key: "rose", name: "Rose", backgroundClass: "bg-rose-500", ringClass: "ring-rose-200" },
  { key: "red", name: "Red", backgroundClass: "bg-red-500", ringClass: "ring-red-200" },
  { key: "orange", name: "Orange", backgroundClass: "bg-orange-500", ringClass: "ring-orange-200" },
  { key: "amber", name: "Amber", backgroundClass: "bg-amber-400", ringClass: "ring-amber-200" },
] as const;

export type ClassColourKey = (typeof CLASS_COLOUR_OPTIONS)[number]["key"];

export const DEFAULT_CLASS_COLOUR_KEY: ClassColourKey = "emerald";

const optionByKey = new Map(CLASS_COLOUR_OPTIONS.map((option) => [option.key, option]));
const legacyKeyByClass = new Map<string, ClassColourKey>(
  CLASS_COLOUR_OPTIONS.map((option) => [option.backgroundClass, option.key])
);

export function normaliseClassColourKey(value: string | null | undefined): ClassColourKey | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (optionByKey.has(trimmed as ClassColourKey)) return trimmed as ClassColourKey;
  return legacyKeyByClass.get(trimmed) ?? null;
}

export function resolveClassColourKey(value: string | null | undefined, classId: number): ClassColourKey {
  return normaliseClassColourKey(value) ?? CLASS_COLOUR_OPTIONS[Math.abs(classId) % CLASS_COLOUR_OPTIONS.length]?.key ?? DEFAULT_CLASS_COLOUR_KEY;
}

export function classColourBackgroundClass(key: ClassColourKey): string {
  return optionByKey.get(key)?.backgroundClass ?? optionByKey.get(DEFAULT_CLASS_COLOUR_KEY)!.backgroundClass;
}

export function classColourRingClass(key: ClassColourKey): string {
  return optionByKey.get(key)?.ringClass ?? optionByKey.get(DEFAULT_CLASS_COLOUR_KEY)!.ringClass;
}
