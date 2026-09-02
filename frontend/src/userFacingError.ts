const SAFE_AUTH_MESSAGE = "Your session has expired or changed. Please log in again to continue. This can happen for security reasons or if you signed in on another device.";
const SAFE_VALIDATION_MESSAGES = new Set([
  "Choose a category first",
  "Enter a category name",
]);

/**
 * Keeps caught API and network errors out of teacher-facing UI unless they are
 * a known safe, actionable account message.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message === SAFE_AUTH_MESSAGE || SAFE_VALIDATION_MESSAGES.has(error.message)) {
      return error.message;
    }
  }
  return fallback;
}
