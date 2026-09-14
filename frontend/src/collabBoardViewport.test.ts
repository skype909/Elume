import {
  calculateBoardFitScale,
  clampManualBoardScale,
  logicalBoardPointFromClient,
  MAX_MANUAL_BOARD_SCALE,
  MIN_MANUAL_BOARD_SCALE,
} from "./collabBoardViewport";

test("Fit uses the available viewport, preserves the 4:3 board, and never upscales", () => {
  expect(calculateBoardFitScale({ viewportWidth: 1200, viewportHeight: 900, padding: 0 })).toBeCloseTo(0.75);
  expect(calculateBoardFitScale({ viewportWidth: 2400, viewportHeight: 1800, padding: 0 })).toBe(1);
  expect(calculateBoardFitScale({ viewportWidth: 1000, viewportHeight: 1000, padding: 0 })).toBeCloseTo(0.625);
});

test("manual zoom clamps to the classroom-safe range", () => {
  expect(clampManualBoardScale(0.1)).toBe(MIN_MANUAL_BOARD_SCALE);
  expect(clampManualBoardScale(2)).toBe(MAX_MANUAL_BOARD_SCALE);
  expect(clampManualBoardScale(0.75)).toBe(0.75);
});

test.each([1, 0.75, 0.5])("display scale %s maps pointer locations back to logical board coordinates", (scale) => {
  const point = logicalBoardPointFromClient({
    clientX: 40 + 800 * scale,
    clientY: 80 + 600 * scale,
    rect: { left: 40, top: 80, width: 1600 * scale, height: 1200 * scale },
  });
  expect(point).toEqual({ x: 800, y: 600 });
});

test("pointer mapping clamps to the logical board rather than a scaled display extent", () => {
  expect(logicalBoardPointFromClient({
    clientX: -20,
    clientY: 900,
    rect: { left: 0, top: 0, width: 800, height: 600 },
  })).toEqual({ x: 0, y: 1200 });
});
