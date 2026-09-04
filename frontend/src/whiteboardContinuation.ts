// A conservative client-side cap for continuation labels; the backend permits
// titles independently, so this is not a database schema limit.
export const WHITEBOARD_TITLE_MAX_LENGTH = 255;

export function getContinuationBoardTitle(
  title: string | null | undefined,
  maximumLength = WHITEBOARD_TITLE_MAX_LENGTH
): string {
  const fallback = "Class Whiteboard";
  const source = (title || fallback).trim() || fallback;
  const matched = source.match(/^(.*?)(?:\s+-\s+part\s+(\d+))$/i);
  const base = (matched?.[1] || source).trim() || fallback;
  const existingPart = Number(matched?.[2]);
  const nextPart = Number.isSafeInteger(existingPart) && existingPart >= 1 ? existingPart + 1 : 2;
  const suffix = ` - Part ${nextPart}`;
  const safeBaseLength = Math.max(1, maximumLength - suffix.length);
  return `${base.slice(0, safeBaseLength).trimEnd() || fallback.slice(0, safeBaseLength)}${suffix}`;
}
