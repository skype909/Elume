export type ServerClassLoadStatus = "loading" | "ready" | "error";

export function shouldShowFirstClassPrompt(
  status: ServerClassLoadStatus,
  serverClassCount: number | null,
  dismissed: boolean
) {
  return status === "ready" && serverClassCount === 0 && !dismissed;
}

export function consumeCreateClassHandoff(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { shouldOpenCreate: false, nextState: state };
  }

  const routeState = state as Record<string, unknown>;
  if (routeState.openCreateClass !== true) {
    return { shouldOpenCreate: false, nextState: state };
  }

  const { openCreateClass: _openCreateClass, ...remainingState } = routeState;
  return {
    shouldOpenCreate: true,
    nextState: Object.keys(remainingState).length > 0 ? remainingState : null,
  };
}

export function shouldShowClassFirstEmptyState(status: ServerClassLoadStatus, classCount: number) {
  return status === "ready" && classCount === 0;
}
