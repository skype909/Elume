import React, { useEffect, useId, useRef, useState } from "react";
import {
  BookOpen,
  Calculator,
  Eraser,
  FilePlus2,
  Expand,
  FileUp,
  Grid3X3,
  Hand,
  Maximize2,
  Minus,
  Music2,
  MoreHorizontal,
  PenLine,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Video,
} from "lucide-react";

export type WhiteboardTool = "pen" | "eraser" | "line" | "hand";

type ToolAction = {
  id: WhiteboardTool;
  label: string;
  Icon: typeof PenLine;
  description: string;
};

export const WHITEBOARD_TOOL_ACTIONS: ToolAction[] = [
  { id: "hand", label: "Select", Icon: Hand, description: "Move around the board and select images" },
  { id: "pen", label: "Pen", Icon: PenLine, description: "Draw freehand" },
  { id: "eraser", label: "Eraser", Icon: Eraser, description: "Erase ink" },
  { id: "line", label: "Line", Icon: Minus, description: "Draw a straight line" },
];

const colourNames: Record<string, string> = {
  "#111827": "Black",
  "#ef4444": "Red",
  "#3b82f6": "Blue",
  "#22c55e": "Green",
  "#a855f7": "Purple",
};

const baseButton =
  "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-55";

export function WhiteboardToolRail({
  tool,
  onToolChange,
}: {
  tool: WhiteboardTool;
  onToolChange: (tool: WhiteboardTool) => void;
}) {
  return (
    <aside aria-label="Whiteboard drawing tools" className="flex shrink-0 flex-wrap gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {WHITEBOARD_TOOL_ACTIONS.map(({ id, label, Icon, description }) => {
          const selected = tool === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              aria-label={label}
              title={`${label}: ${description}`}
              onClick={() => onToolChange(id)}
              className={`${baseButton} shrink-0 px-2.5 ${
                selected
                  ? "border-emerald-700 bg-emerald-600 text-white shadow-[0_5px_14px_rgba(5,150,105,0.24)] hover:bg-emerald-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function WhiteboardContextControls({
  tool,
  colours,
  penColor,
  onPenColorChange,
  penSizes,
  eraserSizes,
  penSize,
  eraserSize,
  onPenSizeChange,
  onEraserSizeChange,
}: {
  tool: WhiteboardTool;
  colours: string[];
  penColor: string;
  onPenColorChange: (colour: string) => void;
  penSizes: number[];
  eraserSizes: number[];
  penSize: number;
  eraserSize: number;
  onPenSizeChange: (size: number) => void;
  onEraserSizeChange: (size: number) => void;
}) {
  const showsInkSettings = tool === "pen" || tool === "line";
  const showsEraserSettings = tool === "eraser";
  if (!showsInkSettings && !showsEraserSettings) return null;

  const sizes = showsEraserSettings ? eraserSizes : penSizes;
  const selectedSize = showsEraserSettings ? eraserSize : penSize;
  const dotColour = showsEraserSettings ? "#334155" : penColor;

  return (
    <section aria-label="Current tool settings" className="flex shrink-0 flex-wrap items-center gap-2 border-l border-slate-200 pl-2">
      {showsInkSettings && (
        <div className="flex items-center gap-1" aria-label="Colour">
          <span className="sr-only">Colour</span>
          {colours.map((colour) => {
            const selected = penColor === colour;
            const name = colourNames[colour] ?? "Pen colour";
            return (
              <button
                key={colour}
                type="button"
                aria-label={name}
                aria-pressed={selected}
                title={name}
                onClick={() => onPenColorChange(colour)}
                className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                  selected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-200"
                }`}
              >
                <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: colour }} />
                <span className="sr-only">{selected ? " selected" : ""}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5" aria-label={showsEraserSettings ? "Eraser size" : "Stroke width"}>
        <span className="sr-only">Width</span>
        {sizes.map((size) => {
          const selected = selectedSize === size;
          const dot = Math.max(5, Math.min(19, size));
          return (
            <button
              key={size}
              type="button"
              aria-label={`Size ${size}`}
              aria-pressed={selected}
              title={`Size ${size}`}
              onClick={() => (showsEraserSettings ? onEraserSizeChange(size) : onPenSizeChange(size))}
              className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                selected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-200"
              }`}
            >
              <span className="rounded-full" style={{ width: dot, height: dot, backgroundColor: dotColour }} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function WhiteboardActionBar({
  isFullscreen,
  saving,
  onFullscreen,
  onImportPdf,
  onFormulaBooklet,
  onAudio,
  onVideo,
  onNewBoard,
  onBack,
  onSave,
}: {
  isFullscreen: boolean;
  saving: boolean;
  onFullscreen: () => void;
  onImportPdf: () => void;
  onFormulaBooklet: () => void;
  onAudio: () => void;
  onVideo: () => void;
  onNewBoard: () => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const actions = [
    { label: "Full screen", Icon: Maximize2, onClick: onFullscreen, activeLabel: "Exit full screen" },
    { label: "Import PDF", Icon: FileUp, onClick: onImportPdf },
    { label: "Formula Booklet", Icon: BookOpen, onClick: onFormulaBooklet },
    { label: "Audio", Icon: Music2, onClick: onAudio },
    { label: "Video", Icon: Video, onClick: onVideo },
    { label: "New board", Icon: FilePlus2, onClick: onNewBoard },
  ];
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {actions.map(({ label, Icon, onClick, activeLabel }) => {
        const visibleLabel = activeLabel && isFullscreen ? activeLabel : label;
        return (
          <button key={label} type="button" aria-label={visibleLabel} title={visibleLabel} onClick={onClick} className={`${baseButton} border-slate-200 bg-white px-3 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">{visibleLabel}</span>
          </button>
        );
      })}
      <button type="button" onClick={onBack} className={`${baseButton} border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50`}>
        <span>Back to Class</span>
      </button>
      <button type="button" aria-label="Save whiteboard" title="Save whiteboard" onClick={onSave} disabled={saving} className={`${baseButton} border-emerald-700 bg-emerald-600 px-4 text-white shadow-sm hover:bg-emerald-700`}>
        <Save className="h-5 w-5" aria-hidden="true" />
        <span>Save</span>
      </button>
    </div>
  );
}

export function WhiteboardBoardActions({
  canUndo,
  canRedo,
  isExtended,
  onUndo,
  onRedo,
  onExtend,
  onGrid,
  onAxes,
  onCalculator,
  onPdfPanel,
  onClearInk,
  onClearAll,
  isPdfVisible,
}: {
  canUndo: boolean;
  canRedo: boolean;
  isExtended: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExtend: () => void;
  onGrid: () => void;
  onAxes: () => void;
  onCalculator: () => void;
  onPdfPanel: () => void;
  onClearInk: () => void;
  onClearAll: () => void;
  isPdfVisible: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const iconAction = (label: string, Icon: typeof Undo2, onClick: () => void, disabled = false) => (
    <button key={label} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`${baseButton} border-slate-200 bg-white px-3 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
  const menuAction = (label: string, Icon: typeof Undo2, onClick: () => void, tone = "") => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={() => {
        onClick();
        setMoreOpen(false);
      }}
      className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 outline-none hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500 ${tone}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-l border-slate-200 pl-2" aria-label="Board actions">
      {iconAction("Undo", Undo2, onUndo, !canUndo)}
      {iconAction("Redo", Redo2, onRedo, !canRedo)}
      <button
        type="button"
        aria-label="Extend board"
        title="Adds more writing space below."
        disabled={isExtended}
        onClick={onExtend}
        className={`${baseButton} border-violet-200 bg-violet-50 px-3 text-violet-800 hover:border-violet-300 hover:bg-violet-100`}
      >
        <Expand className="h-5 w-5" aria-hidden="true" />
        <span>{isExtended ? "Board extended" : "Extend board"}</span>
      </button>
      {isPdfVisible && (
        <button type="button" aria-label="Hide PDF" title="Hide PDF" onClick={onPdfPanel} className={`${baseButton} border-slate-200 bg-white px-2.5 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50`}>
          <span>Hide PDF</span>
        </button>
      )}
      <div className="relative" ref={moreRef}>
        <button
          type="button"
          aria-label="More tools"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-controls={menuId}
          title="More tools"
          onClick={() => setMoreOpen((open) => !open)}
          className={`${baseButton} border-slate-200 bg-white px-2.5 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50`}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>More tools</span>
        </button>
        {moreOpen && (
          <div id={menuId} role="menu" aria-label="More board tools" className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {menuAction("Grid", Grid3X3, onGrid)}
            {menuAction("XY Plane", Grid3X3, onAxes)}
            {menuAction("Calculator", Calculator, onCalculator)}
            {!isPdfVisible && menuAction("Show PDF", FileUp, onPdfPanel)}
            {menuAction("Clear Ink", Eraser, onClearInk)}
            {menuAction("Erase All", Trash2, onClearAll, "text-rose-700 hover:bg-rose-50 focus-visible:bg-rose-50")}
          </div>
        )}
      </div>
    </div>
  );
}
