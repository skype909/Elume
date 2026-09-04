import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  WhiteboardActionBar,
  WhiteboardBoardActions,
  WhiteboardContextControls,
  WhiteboardToolRail,
  type WhiteboardTool,
} from "./Components/WhiteboardControls";
import { INITIAL_WHITEBOARD_HEIGHT, useWhiteboardExtension } from "./whiteboardExtension";
import { getContinuationBoardTitle, WHITEBOARD_TITLE_MAX_LENGTH } from "./whiteboardContinuation";
import { getBottomRightResizeHandle, isWithinBottomRightResizeHandle } from "./whiteboardImageResize";

function ProductionControlsHarness({ initialHeight = INITIAL_WHITEBOARD_HEIGHT }: { initialHeight?: number }) {
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [colour, setColour] = useState("#111827");
  const [penSize, setPenSize] = useState(2);
  const [eraserSize, setEraserSize] = useState(24);
  const [height, setHeight] = useState(initialHeight);
  const [dirty, setDirty] = useState(false);
  const [extended, setExtended] = useState(false);
  const { isBoardExtended, extendBoard } = useWhiteboardExtension({
    canvasHeight: height,
    setCanvasHeight: setHeight,
    markDirty: () => setDirty(true),
    onExtended: () => setExtended(true),
  });

  return (
    <div>
      <WhiteboardActionBar
        isFullscreen={false}
        saving={false}
        onFullscreen={() => undefined}
        onImportPdf={() => undefined}
        onFormulaBooklet={() => undefined}
        onAudio={() => undefined}
        onVideo={() => undefined}
        onNewBoard={() => undefined}
        onBack={() => undefined}
        onSave={() => undefined}
      />
      <WhiteboardToolRail tool={tool} onToolChange={setTool} />
      <WhiteboardContextControls
        tool={tool}
        colours={["#111827", "#ef4444"]}
        penColor={colour}
        onPenColorChange={setColour}
        penSizes={[2, 6, 12]}
        eraserSizes={[10, 24, 40]}
        penSize={penSize}
        eraserSize={eraserSize}
        onPenSizeChange={setPenSize}
        onEraserSizeChange={setEraserSize}
      />
      <WhiteboardBoardActions
        canUndo={false}
        canRedo={false}
        isExtended={isBoardExtended}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onExtend={extendBoard}
        onGrid={() => undefined}
        onAxes={() => undefined}
        onCalculator={() => undefined}
        onPdfPanel={() => undefined}
        onClearInk={() => undefined}
        onClearAll={() => undefined}
        isPdfVisible={true}
      />
      <p>Canvas height: {height}</p>
      <p>Dirty: {dirty ? "yes" : "no"}</p>
      <p>Extension separator: {extended ? "ready" : "not ready"}</p>
      <p>Existing board content remains</p>
    </div>
  );
}

function ReloadableExtensionHarness() {
  const [height, setHeight] = useState(INITIAL_WHITEBOARD_HEIGHT);
  const { isBoardExtended, extendBoard } = useWhiteboardExtension({
    canvasHeight: height,
    setCanvasHeight: setHeight,
    markDirty: () => undefined,
    onExtended: () => undefined,
  });

  return (
    <div>
      <WhiteboardBoardActions
        canUndo={false}
        canRedo={false}
        isExtended={isBoardExtended}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onExtend={extendBoard}
        onGrid={() => undefined}
        onAxes={() => undefined}
        onCalculator={() => undefined}
        onPdfPanel={() => undefined}
        onClearInk={() => undefined}
        onClearAll={() => undefined}
        isPdfVisible={false}
      />
      <button type="button" onClick={() => setHeight(INITIAL_WHITEBOARD_HEIGHT)}>Load normal board</button>
    </div>
  );
}

describe("production Whiteboard controls", () => {
  test("generates one safe continuation title without repeating a Part suffix", () => {
    expect(getContinuationBoardTitle("Fractions")).toBe("Fractions - Part 2");
    expect(getContinuationBoardTitle("Fractions - Part 2")).toBe("Fractions - Part 3");
    expect(getContinuationBoardTitle("Fractions - PART 3")).toBe("Fractions - Part 4");
    expect(getContinuationBoardTitle("Class Whiteboard")).toBe("Class Whiteboard - Part 2");
  });

  test("handles whitespace, non-final Part text, malformed suffixes, and conservative title capping", () => {
    expect(getContinuationBoardTitle("   ")).toBe("Class Whiteboard - Part 2");
    expect(getContinuationBoardTitle("  Fractions  ")).toBe("Fractions - Part 2");
    expect(getContinuationBoardTitle("Part 2 recap")).toBe("Part 2 recap - Part 2");
    expect(getContinuationBoardTitle("Fractions - Part not-a-number")).toBe("Fractions - Part not-a-number - Part 2");
    expect(getContinuationBoardTitle("Fractions - Part 999999999999999999999999999")).toBe("Fractions - Part 2");

    const capped = getContinuationBoardTitle("F".repeat(WHITEBOARD_TITLE_MAX_LENGTH));
    expect(capped).toHaveLength(WHITEBOARD_TITLE_MAX_LENGTH);
    expect(capped.endsWith(" - Part 2")).toBe(true);
  });

  test("uses the visible resize handle centre for the forgiving production hit target", () => {
    const image = { x: 100, y: 80, w: 200, h: 120 };
    const handle = getBottomRightResizeHandle(image);
    expect(handle).toMatchObject({ x: 300, y: 200, visualRadius: 13, hitRadius: 22 });
    expect(isWithinBottomRightResizeHandle(image, handle.x, handle.y)).toBe(true);
    expect(isWithinBottomRightResizeHandle(image, handle.x + handle.visualRadius, handle.y)).toBe(true);
    expect(isWithinBottomRightResizeHandle(image, handle.x - handle.visualRadius, handle.y)).toBe(true);
    expect(isWithinBottomRightResizeHandle(image, handle.x + 20, handle.y + 20)).toBe(true);
    expect(isWithinBottomRightResizeHandle(image, handle.x + 23, handle.y)).toBe(false);
  });

  test("renders real drawing tools with accessible selected state and contextual settings", () => {
    render(<ProductionControlsHarness />);

    expect(screen.getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Black")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Size 24" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Pen" }));
    fireEvent.click(screen.getByRole("button", { name: "Red" }));
    fireEvent.click(screen.getByRole("button", { name: "Size 6" }));
    expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Size 6" })).toHaveAttribute("aria-pressed", "true");
  });

  test("uses the production extension guard once, marks dirty, and keeps existing content", () => {
    render(<ProductionControlsHarness />);

    expect(screen.queryByRole("button", { name: /add page/i })).not.toBeInTheDocument();
    const extend = screen.getByRole("button", { name: "Extend board" });
    expect(extend).toHaveAttribute("title", "Adds more writing space below.");
    fireEvent.click(extend);
    fireEvent.click(extend);

    expect(screen.getByText("Canvas height: 3600")).toBeInTheDocument();
    expect(screen.getByText("Dirty: yes")).toBeInTheDocument();
    expect(screen.getByText("Extension separator: ready")).toBeInTheDocument();
    expect(screen.getByText("Existing board content remains")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extend board" })).toBeDisabled();
    expect(screen.getByText("Board extended")).toBeInTheDocument();
  });

  test("keeps legacy tall boards at their restored height and disables extension", () => {
    render(<ProductionControlsHarness initialHeight={4800} />);

    expect(screen.getByText("Canvas height: 4800")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extend board" })).toBeDisabled();
    expect(screen.getByText("Board extended")).toBeInTheDocument();
  });

  test("resets the synchronous extension guard when a normal-height board is loaded", () => {
    render(<ReloadableExtensionHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Extend board" }));
    expect(screen.getByRole("button", { name: "Extend board" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Load normal board" }));
    expect(screen.getByRole("button", { name: "Extend board" })).toBeEnabled();
  });

  test("keeps existing PDF and YouTube entry controls available", () => {
    render(<ProductionControlsHarness />);

    expect(screen.getByRole("button", { name: "Import PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Video" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide PDF" })).toBeInTheDocument();
  });

  test("keeps secondary board actions in an accessible More tools menu", () => {
    render(<ProductionControlsHarness />);

    const moreTools = screen.getByRole("button", { name: "More tools" });
    expect(moreTools).toHaveAttribute("aria-haspopup", "menu");
    expect(moreTools).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu", { name: "More board tools" })).not.toBeInTheDocument();

    fireEvent.click(moreTools);
    expect(moreTools).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Grid" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "XY Plane" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Calculator" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear Ink" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Erase All" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "More board tools" })).not.toBeInTheDocument();
  });
});
