export const COLLAB_LOGICAL_WIDTH = 1600;
export const COLLAB_LOGICAL_HEIGHT = 1200;
export const MIN_MANUAL_BOARD_SCALE = 0.35;
export const MAX_MANUAL_BOARD_SCALE = 1.25;
export const BOARD_FIT_PADDING = 24;

export function calculateBoardFitScale({
  viewportWidth,
  viewportHeight,
  boardWidth = COLLAB_LOGICAL_WIDTH,
  boardHeight = COLLAB_LOGICAL_HEIGHT,
  padding = BOARD_FIT_PADDING,
  maxScale = 1,
}: {
  viewportWidth: number;
  viewportHeight: number;
  boardWidth?: number;
  boardHeight?: number;
  padding?: number;
  maxScale?: number;
}) {
  const usableWidth = Math.max(1, viewportWidth - padding);
  const usableHeight = Math.max(1, viewportHeight - padding);
  return Math.min(maxScale, usableWidth / boardWidth, usableHeight / boardHeight);
}

export function clampManualBoardScale(scale: number) {
  return Math.min(MAX_MANUAL_BOARD_SCALE, Math.max(MIN_MANUAL_BOARD_SCALE, scale));
}

export function logicalBoardPointFromClient({
  clientX,
  clientY,
  rect,
  boardWidth = COLLAB_LOGICAL_WIDTH,
  boardHeight = COLLAB_LOGICAL_HEIGHT,
}: {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
  boardWidth?: number;
  boardHeight?: number;
}) {
  const x = ((clientX - rect.left) * boardWidth) / Math.max(rect.width, 1);
  const y = ((clientY - rect.top) * boardHeight) / Math.max(rect.height, 1);
  return {
    x: Math.min(boardWidth, Math.max(0, x)),
    y: Math.min(boardHeight, Math.max(0, y)),
  };
}
