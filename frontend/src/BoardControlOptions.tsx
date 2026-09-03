import React from "react";
import { Check } from "lucide-react";

const DOT_SIZES = { 1: "h-2 w-2", 2: "h-4 w-4", 3: "h-6 w-6" } as const;
const SIZE_LABELS = { 1: "Fine", 2: "Medium", 3: "Bold" } as const;

export function ColourSwatch({
  color,
  label,
  selected,
  onClick,
}: {
  color: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${selected
        ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
        : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50"
        }`}
    >
      <span className="relative grid h-6 w-6 place-items-center rounded-full border border-white/90 shadow-sm" style={{ backgroundColor: color }}>
        {selected && <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} aria-hidden="true" />}
      </span>
    </button>
  );
}

export function StrokeSizeButton({
  value,
  selected,
  color = "#0f172a",
  onClick,
}: {
  value: 1 | 2 | 3;
  selected: boolean;
  color?: string;
  onClick: () => void;
}) {
  const label = SIZE_LABELS[value];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} stroke`}
      aria-pressed={selected}
      title={`${label} stroke`}
      className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${selected
        ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
        : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50"
        }`}
    >
      <span className={`rounded-full ${DOT_SIZES[value]}`} style={{ backgroundColor: color }} aria-hidden="true" />
    </button>
  );
}
