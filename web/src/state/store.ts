import { create } from "zustand";
import type { Plan, SkillCall, StepResult, StepStatus } from "../types";

export type Phase =
  | "idle"
  | "planning"
  | "clarifying"
  | "ready"
  | "executing"
  | "done"
  | "error";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  kind: "message" | "reasoning" | "clarification" | "summary" | "error";
  text: string;
  questions?: string[];
  timestamp: number;
}

interface StepUiState {
  status: StepStatus;
  detail: string;
}

interface StoreState {
  sessionId: string;
  phase: Phase;

  turns: Turn[];

  pendingClarification: { questions: string[] } | null;

  plan: Plan | null;
  // Per-step execution state, keyed by current plan step index
  stepStates: StepUiState[];

  modelUsed: string | null;
  errorMsg: string | null;

  // ---- actions
  pushTurn: (turn: Omit<Turn, "id" | "timestamp">) => void;
  setPhase: (phase: Phase) => void;
  setPlan: (plan: Plan | null) => void;
  updateStep: (index: number, partial: Partial<SkillCall>) => void;
  removeStep: (index: number) => void;
  addStep: (step: SkillCall) => void;
  reorderSteps: (from: number, to: number) => void;
  setStepStates: (states: StepUiState[]) => void;
  patchStepState: (index: number, partial: Partial<StepUiState>) => void;
  setClarification: (questions: string[] | null) => void;
  setModelUsed: (model: string | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useStore = create<StoreState>((set) => ({
  sessionId: uid(),
  phase: "idle",
  turns: [],
  pendingClarification: null,
  plan: null,
  stepStates: [],
  modelUsed: null,
  errorMsg: null,

  pushTurn: (turn) =>
    set((s) => ({
      turns: [
        ...s.turns,
        { ...turn, id: uid(), timestamp: Date.now() },
      ],
    })),

  setPhase: (phase) => set({ phase }),

  setPlan: (plan) =>
    set({
      plan,
      stepStates: plan
        ? plan.steps.map(() => ({ status: "pending" as StepStatus, detail: "" }))
        : [],
    }),

  updateStep: (index, partial) =>
    set((s) => {
      if (!s.plan) return s;
      const steps = s.plan.steps.map((step, i) =>
        i === index
          ? {
              ...step,
              ...partial,
              arguments: { ...step.arguments, ...(partial.arguments ?? {}) },
            }
          : step,
      );
      return { plan: { ...s.plan, steps } };
    }),

  removeStep: (index) =>
    set((s) => {
      if (!s.plan) return s;
      const steps = s.plan.steps.filter((_, i) => i !== index);
      const stepStates = s.stepStates.filter((_, i) => i !== index);
      return { plan: { ...s.plan, steps }, stepStates };
    }),

  addStep: (step) =>
    set((s) => {
      if (!s.plan) {
        return {
          plan: { steps: [step] },
          stepStates: [{ status: "pending" as StepStatus, detail: "" }],
        };
      }
      return {
        plan: { ...s.plan, steps: [...s.plan.steps, step] },
        stepStates: [...s.stepStates, { status: "pending", detail: "" }],
      };
    }),

  reorderSteps: (from, to) =>
    set((s) => {
      if (!s.plan) return s;
      const steps = [...s.plan.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      const stepStates = [...s.stepStates];
      const [movedState] = stepStates.splice(from, 1);
      stepStates.splice(to, 0, movedState);
      return { plan: { ...s.plan, steps }, stepStates };
    }),

  setStepStates: (states) => set({ stepStates: states }),

  patchStepState: (index, partial) =>
    set((s) => {
      const next = [...s.stepStates];
      if (!next[index]) return s;
      next[index] = { ...next[index], ...partial };
      return { stepStates: next };
    }),

  setClarification: (questions) =>
    set({
      pendingClarification: questions ? { questions } : null,
    }),

  setModelUsed: (modelUsed) => set({ modelUsed }),
  setError: (errorMsg) => set({ errorMsg }),

  reset: () =>
    set({
      phase: "idle",
      turns: [],
      pendingClarification: null,
      plan: null,
      stepStates: [],
      modelUsed: null,
      errorMsg: null,
    }),
}));

// Helper: convert ExecuteResponse trace into store updates.
export function applyTraceToStore(steps: StepResult[]) {
  const { patchStepState } = useStore.getState();
  steps.forEach((s) => {
    patchStepState(s.index, { status: s.status, detail: s.detail });
  });
}
