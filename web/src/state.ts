/**
 * Mutable application state.
 * All state lives here; components read from and write to this object.
 * No reactive framework — call render() after mutations.
 */

import type { Binding, Plan, StepResult } from "./types";

export type UiPhase =
  | "idle"
  | "planning"
  | "clarifying"
  | "confirming"
  | "executing"
  | "done";

export interface AppState {
  phase: UiPhase;
  sessionId: string;

  // Plan flow
  userText: string;
  reasoning: string;
  clarificationQuestions: string[];
  clarificationReplies: string[];
  currentPlan: Plan | null;
  traceSteps: StepResult[];
  lastError: string;

  // Bindings
  bindings: Binding[];
  bindingError: string;
  bindingReasoning: string;

  // Event feed (last N events shown)
  recentEvents: string[];
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

export const state: AppState = {
  phase: "idle",
  sessionId:
    sessionStorage.getItem("rewire_session_id") ?? generateSessionId(),

  userText: "",
  reasoning: "",
  clarificationQuestions: [],
  clarificationReplies: [],
  currentPlan: null,
  traceSteps: [],
  lastError: "",

  bindings: [],
  bindingError: "",
  bindingReasoning: "",

  recentEvents: [],
};

// Persist session id for clarification continuity
sessionStorage.setItem("rewire_session_id", state.sessionId);

export function resetPlanFlow(): void {
  state.phase = "idle";
  state.reasoning = "";
  state.clarificationQuestions = [];
  state.clarificationReplies = [];
  state.currentPlan = null;
  state.traceSteps = [];
  state.lastError = "";
}

export function pushEvent(label: string): void {
  state.recentEvents.unshift(label);
  if (state.recentEvents.length > 20) {
    state.recentEvents.length = 20;
  }
}
