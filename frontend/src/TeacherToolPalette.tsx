import React from "react";
import {
  ArrowRight,
  Circle,
  Eraser,
  Highlighter,
  MessageCircle,
  MousePointer2,
  PenLine,
  Square,
  StickyNote,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import { TEACHER_TOOL_ACTIONS, type TeacherBoardTool } from "./collaborationToolControls";

const TOOL_ICONS: Record<TeacherBoardTool, LucideIcon> = {
  select: MousePointer2,
  pen: PenLine,
  highlighter: Highlighter,
  eraser: Eraser,
  rectangle: Square,
  circle: Circle,
  triangle: Triangle,
  sticky: StickyNote,
  arrow: ArrowRight,
  "curved-arrow": ArrowRight,
  speech: MessageCircle,
};

export function TeacherToolPalette({
  selectedTool,
  onToolChange,
}: {
  selectedTool: TeacherBoardTool | "pdf";
  onToolChange: (tool: TeacherBoardTool) => void;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="text-sm font-black text-slate-900">Board tools</div>
        <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
          {TEACHER_TOOL_ACTIONS.find((item) => item.key === selectedTool)?.label}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {TEACHER_TOOL_ACTIONS.map(({ key, label }) => {
          const Icon = TOOL_ICONS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToolChange(key)}
              aria-pressed={selectedTool === key}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-2 text-xs font-black shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${selectedTool === key
                ? "border-emerald-500 bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50"
                }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
