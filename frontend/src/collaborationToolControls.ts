export type TeacherBoardTool =
  | "select"
  | "pen"
  | "eraser"
  | "highlighter"
  | "rectangle"
  | "circle"
  | "triangle"
  | "speech"
  | "sticky"
  | "arrow"
  | "curved-arrow";

export const TEACHER_TOOL_ACTIONS: ReadonlyArray<{ key: TeacherBoardTool; label: string }> = [
  { key: "select", label: "Select" },
  { key: "pen", label: "Pen" },
  { key: "highlighter", label: "Highlighter" },
  { key: "eraser", label: "Eraser" },
  { key: "rectangle", label: "Rectangle" },
  { key: "circle", label: "Circle" },
  { key: "triangle", label: "Triangle" },
  // The established arrow object is the board's straight-line action; no new object type is introduced.
  { key: "arrow", label: "Line / Arrow" },
  { key: "curved-arrow", label: "Curve" },
  { key: "sticky", label: "Sticky note" },
  { key: "speech", label: "Speech bubble" },
];

export const STUDENT_DRAWING_TOOLS = ["pen", "highlighter", "eraser", "sticky"] as const;
export type StudentDrawingTool = (typeof STUDENT_DRAWING_TOOLS)[number];

// Drawing tools always return the board to its existing fixed viewport mode.
export function selectStudentDrawingTool(
  nextTool: StudentDrawingTool,
  setTool: (tool: StudentDrawingTool) => void,
  setViewportMode: (mode: "fixed") => void
) {
  setTool(nextTool);
  setViewportMode("fixed");
}

// Preserve the existing board contract: pan mode delegates movement through select.
export function studentBoardTool(viewportMode: "fixed" | "pan", drawingTool: StudentDrawingTool): StudentDrawingTool | "select" {
  return viewportMode === "pan" ? "select" : drawingTool;
}
