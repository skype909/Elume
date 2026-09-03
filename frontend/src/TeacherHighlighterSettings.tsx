import React from "react";
import { ColourSwatch, StrokeSizeButton } from "./BoardControlOptions";

const HIGHLIGHTER_COLOURS = ["yellow", "green", "blue", "violet"] as const;
const STROKE_SIZES = [{ value: 1, label: "Fine" }, { value: 2, label: "Medium" }, { value: 3, label: "Bold" }] as const;

export function TeacherHighlighterSettings({
  color,
  penSize,
  onColorChange,
  onPenSizeChange,
}: {
  color: string;
  penSize: 1 | 2 | 3;
  onColorChange: (color: string) => void;
  onPenSizeChange: (size: 1 | 2 | 3) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Colour</div>
        <div className="flex flex-wrap gap-2">
        {HIGHLIGHTER_COLOURS.map((option) => (
          <ColourSwatch
            key={option}
            color={option}
            label={option.charAt(0).toUpperCase() + option.slice(1)}
            selected={color === option}
            onClick={() => onColorChange(option)}
          />
        ))}
        </div>
      </div>
      <div>
        <div className="mb-1 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Stroke</div>
        <div className="flex gap-2" aria-label="Highlighter width">
        {STROKE_SIZES.map(({ value }) => (
          <StrokeSizeButton
            key={value}
            value={value}
            color={color}
            selected={penSize === value}
            onClick={() => onPenSizeChange(value)}
          />
        ))}
        </div>
      </div>
    </div>
  );
}
