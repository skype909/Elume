import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export const INITIAL_WHITEBOARD_HEIGHT = 2400;
export const WHITEBOARD_EXTENSION_AMOUNT = 1200;
export const WHITEBOARD_EXTENSION_MAX_HEIGHT = INITIAL_WHITEBOARD_HEIGHT + WHITEBOARD_EXTENSION_AMOUNT;

export function useWhiteboardExtension({
  canvasHeight,
  setCanvasHeight,
  markDirty,
  onExtended,
}: {
  canvasHeight: number;
  setCanvasHeight: Dispatch<SetStateAction<number>>;
  markDirty: () => void;
  onExtended: () => void;
}) {
  const extensionUsedRef = useRef(canvasHeight > INITIAL_WHITEBOARD_HEIGHT);
  const [extensionUsed, setExtensionUsed] = useState(canvasHeight > INITIAL_WHITEBOARD_HEIGHT);

  useEffect(() => {
    const hasExtraBoardSpace = canvasHeight > INITIAL_WHITEBOARD_HEIGHT;
    extensionUsedRef.current = hasExtraBoardSpace;
    setExtensionUsed(hasExtraBoardSpace);
  }, [canvasHeight]);

  const extendBoard = useCallback(() => {
    if (extensionUsedRef.current || canvasHeight > INITIAL_WHITEBOARD_HEIGHT) return;
    extensionUsedRef.current = true;
    setExtensionUsed(true);
    onExtended();
    setCanvasHeight((height) =>
      height === INITIAL_WHITEBOARD_HEIGHT ? WHITEBOARD_EXTENSION_MAX_HEIGHT : height
    );
    markDirty();
  }, [canvasHeight, markDirty, onExtended, setCanvasHeight]);

  return {
    isBoardExtended: extensionUsed || canvasHeight > INITIAL_WHITEBOARD_HEIGHT,
    extendBoard,
  };
}
