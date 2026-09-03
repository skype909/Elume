import {
  classColourBackgroundClass,
  classColourRingClass,
  normaliseClassColourKey,
  resolveClassColourKey,
  type ClassColourKey,
} from "./classAppearance";

type ClassAppearanceItem = { id: number; color?: string | null };

const PLANNER_BADGE_BY_KEY: Record<ClassColourKey, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  teal: "border-teal-200 bg-teal-50 text-teal-700",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  fuchsia: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  red: "border-red-200 bg-red-50 text-red-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
};
const DEFAULT_PLANNER_BADGE = "border-slate-200 bg-slate-100 text-slate-600";

export function plannerClassBadgeClass(classId: number | null, colour?: string | null) {
  if (typeof classId !== "number" || classId <= 0) return DEFAULT_PLANNER_BADGE;
  return PLANNER_BADGE_BY_KEY[resolveClassColourKey(colour, classId)] ?? DEFAULT_PLANNER_BADGE;
}

function textClassForTile(backgroundClass: string) {
  return backgroundClass.includes("bg-amber") ? "text-slate-900" : "text-white";
}

export function tileVisualForClass(item: ClassAppearanceItem) {
  const colourKey = resolveClassColourKey(item.color, item.id);
  const bg = classColourBackgroundClass(colourKey);
  return {
    bg,
    ring: classColourRingClass(colourKey),
    text: textClassForTile(bg),
  };
}

export function resolveClassPageColourKey(
  serverColour: string | null | undefined,
  legacyLocalColour: string | null | undefined,
  classId: number
): ClassColourKey {
  return (
    normaliseClassColourKey(serverColour) ??
    normaliseClassColourKey(legacyLocalColour) ??
    resolveClassColourKey(null, classId)
  );
}
