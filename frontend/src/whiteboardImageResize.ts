export type WhiteboardImageBounds = { x: number; y: number; w: number; h: number };

export const VISIBLE_RESIZE_HANDLE_SIZE = 26;

export function getBottomRightResizeHandle(image: WhiteboardImageBounds) {
  return {
    x: image.x + image.w,
    y: image.y + image.h,
    visualRadius: VISIBLE_RESIZE_HANDLE_SIZE / 2,
    // A 44px stylus-friendly target centred on the visible 26px handle.
    hitRadius: 22,
  };
}

export function isWithinBottomRightResizeHandle(image: WhiteboardImageBounds, x: number, y: number) {
  const handle = getBottomRightResizeHandle(image);
  return Math.abs(x - handle.x) <= handle.hitRadius && Math.abs(y - handle.y) <= handle.hitRadius;
}
