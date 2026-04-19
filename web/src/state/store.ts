import { create } from "zustand";
import type {
  Plan,
  PriorTurn,
  RecentEvent,
  RecentFire,
  SkillCall,
  StepResult,
  StepStatus,
  TriggerPattern,
} from "../types";

export type Phase =
  | "idle"
  | "planning"
  | "clarifying"
  | "ready"
  | "executing"
  | "done"
  | "armed"
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

export interface TriggerActivity {
  id: string;
  // armed: user activated a binding; the trigger is now listening.
  // fired: a binding fired and ran cleanly.
  // fired_failed: a binding fired but at least one step failed.
  // disarmed: user stopped listening.
  kind: "armed" | "fired" | "fired_failed" | "disarmed";
  text: string;
  timestamp: number;
}

const MAX_TRIGGER_ACTIVITY = 50;

interface StoreState {
  sessionId: string;
  phase: Phase;

  turns: Turn[];

  pendingClarification: { questions: string[] } | null;

  plan: Plan | null;
  // Per-step execution state, keyed by current plan step index
  stepStates: StepUiState[];

  // Latest user request text — used to derive a friendly binding display name.
  lastUserText: string | null;

  // Set when the planner returns a TriggerPattern. While this is non-null the
  // primary action shifts from "Run now" to "Activate trigger".
  suggestedTrigger: TriggerPattern | null;

  // Set after the user activates a trigger; identifies the binding currently
  // armed on the companion so the UI can offer a "Stop listening" action.
  activeBindingId: string | null;

  modelUsed: string | null;
  errorMsg: string | null;

  // Live event feed, fed by the SSE stream from /events/stream. Each list is
  // ordered oldest-first and ring-buffered at a small fixed cap so render
  // cost stays bounded.
  recentEvents: RecentEvent[];
  recentFires: RecentFire[];
  // True once the SSE EventSource has delivered its initial snapshot. Used
  // by LiveTranscript to distinguish "still connecting" from "no events yet".
  eventsConnected: boolean;

  // Structured planner history shipped with every /plan request so the
  // model can edit the most recent plan instead of re-deriving from the
  // new instruction alone. Only turns that produced a real plan are kept;
  // clarification rounds collapse into one entry per round.
  planHistory: PriorTurn[];

  // Lifecycle log for the currently-armed binding (and recent past arms):
  // "armed", each "fired", "disarmed". Lives in a dedicated panel so the
  // chat doesn't inflate on every fire. Bounded ring buffer.
  triggerActivity: TriggerActivity[];

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
  setLastUserText: (text: string | null) => void;
  setSuggestedTrigger: (trigger: TriggerPattern | null) => void;
  setActiveBindingId: (id: string | null) => void;
  setEventsSnapshot: (events: RecentEvent[], fires: RecentFire[]) => void;
  pushRecentEvent: (event: RecentEvent) => void;
  pushRecentFire: (fire: RecentFire) => void;
  setEventsConnected: (connected: boolean) => void;
  appendPlanHistory: (turn: PriorTurn) => void;
  resetPlanHistory: () => void;
  pushTriggerActivity: (entry: Omit<TriggerActivity, "id" | "timestamp">) => void;
  clearTriggerActivity: () => void;
  reset: () => void;
}

const MAX_RECENT_EVENTS = 30;
const MAX_RECENT_FIRES = 15;

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
  lastUserText: null,
  suggestedTrigger: null,
  activeBindingId: null,
  modelUsed: null,
  errorMsg: null,
  recentEvents: [],
  recentFires: [],
  eventsConnected: false,
  planHistory: [],
  triggerActivity: [],

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
  setLastUserText: (lastUserText) => set({ lastUserText }),
  setSuggestedTrigger: (suggestedTrigger) => set({ suggestedTrigger }),
  setActiveBindingId: (activeBindingId) => set({ activeBindingId }),

  setEventsSnapshot: (recentEvents, recentFires) =>
    set({
      recentEvents: recentEvents.slice(-MAX_RECENT_EVENTS),
      recentFires: recentFires.slice(-MAX_RECENT_FIRES),
      eventsConnected: true,
    }),

  pushRecentEvent: (event) =>
    set((s) => {
      // De-dup by id so a snapshot+stream race doesn't render twice.
      if (s.recentEvents.some((e) => e.id === event.id)) return s;
      const next = [...s.recentEvents, event];
      if (next.length > MAX_RECENT_EVENTS) next.splice(0, next.length - MAX_RECENT_EVENTS);
      return { recentEvents: next };
    }),

  pushRecentFire: (fire) =>
    set((s) => {
      if (s.recentFires.some((f) => f.id === fire.id)) return s;
      const next = [...s.recentFires, fire];
      if (next.length > MAX_RECENT_FIRES) next.splice(0, next.length - MAX_RECENT_FIRES);
      return { recentFires: next };
    }),

  setEventsConnected: (eventsConnected) => set({ eventsConnected }),

  appendPlanHistory: (turn) =>
    set((s) => ({ planHistory: [...s.planHistory, turn] })),

  resetPlanHistory: () => set({ planHistory: [] }),

  pushTriggerActivity: (entry) =>
    set((s) => {
      const next: TriggerActivity[] = [
        ...s.triggerActivity,
        { ...entry, id: uid(), timestamp: Date.now() },
      ];
      if (next.length > MAX_TRIGGER_ACTIVITY) {
        next.splice(0, next.length - MAX_TRIGGER_ACTIVITY);
      }
      return { triggerActivity: next };
    }),

  clearTriggerActivity: () => set({ triggerActivity: [] }),

  reset: () =>
    set({
      phase: "idle",
      turns: [],
      pendingClarification: null,
      plan: null,
      stepStates: [],
      lastUserText: null,
      suggestedTrigger: null,
      activeBindingId: null,
      modelUsed: null,
      errorMsg: null,
      planHistory: [],
      triggerActivity: [],
    }),
}));

// Helper: convert ExecuteResponse trace into store updates.
export function applyTraceToStore(steps: StepResult[]) {
  const { patchStepState } = useStore.getState();
  steps.forEach((s) => {
    patchStepState(s.index, { status: s.status, detail: s.detail });
  });
}
