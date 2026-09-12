import type { EngineSnapshot, Run, TraceEvent } from "./types";

/**
 * CopilotKit / AG-UI hook points.
 * The agent still does not live in this UI. These events are for
 * generative UI and in-app actions when you mount CopilotKit on the day.
 *
 * Wire with @copilotkit/runtime + AG-UI. Do not bolt it on for the prize
 * unless the human can see the agent *doing* inside the real environment.
 */
export type AgUiEvent =
  | { type: "RunStarted"; runId: string }
  | { type: "StateSnapshot"; snapshot: EngineSnapshot }
  | { type: "TraceDelta"; trace: TraceEvent }
  | { type: "HitlRequired"; runId: string; approvalId: string }
  | { type: "RunFinished"; run: Run };

export type AgUiEmitter = (event: AgUiEvent) => void;

const listeners = new Set<AgUiEmitter>();

export function onAgUi(listener: AgUiEmitter) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAgUi(event: AgUiEvent) {
  for (const listener of listeners) listener(event);
}

/** Map a finished run to a short AG-UI state the generative UI can render. */
export function runToAgUiState(run: Run) {
  return {
    environment: run.event.environmentName,
    place: run.event.environmentKind,
    status: run.status,
    lastText: run.assistantText ?? "",
    homeIsNotThisScreen: true,
  };
}
