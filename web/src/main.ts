/**
 * main.ts — entry point.
 * Wires DOM events → state → api → render.
 * No framework. State mutations always call render() after.
 */

import {
  ApiError,
  configureBindings,
  executeFallback,
  executePlan,
  getBindings,
  health,
  planFromNL,
} from "./api";
import {
  appendEventFeed,
  renderBindings,
  setBindingBtnDisabled,
  showBindingError,
} from "./components/BindingPanel";
import { clearBlockList, renderPlanPreview, updateStepStatus } from "./components/BlockList";
import {
  getClarificationReplies,
  hideClarification,
  renderClarification,
  setFormDisabled,
  setupBrowserKeyEvents,
  setupMic,
  showError,
} from "./components/PlanForm";
import { clearReasoning, showReasoning } from "./components/ReasoningStream";
import { pushEvent, resetPlanFlow, state } from "./state";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  // Check companion health
  const statusBar = document.getElementById("status-bar") as HTMLElement;
  try {
    const h = await health();
    statusBar.innerHTML =
      `<span class="ok">● connected</span> — ${h.manifest_id} · adapter: ${h.adapter}`;
  } catch {
    statusBar.innerHTML = '<span class="err">● companion unreachable</span>';
  }

  // Load bindings
  try {
    const cfg = await getBindings();
    state.bindings = cfg.bindings;
    renderBindings(state.bindings);
  } catch {
    // non-fatal
  }

  // Set up mic
  setupMic((text) => {
    (document.getElementById("nl-input") as HTMLTextAreaElement).value = text;
  });

  // Browser keyboard → /events
  setupBrowserKeyEvents(state);

  // Poll bindings every 3s to pick up changes from other clients / dispatcher
  setInterval(() => {
    void getBindings().then((cfg) => {
      state.bindings = cfg.bindings;
      renderBindings(state.bindings);
    });
  }, 3000);
}

// ---------------------------------------------------------------------------
// Plan flow
// ---------------------------------------------------------------------------

async function handlePlan(): Promise<void> {
  const textarea = document.getElementById("nl-input") as HTMLTextAreaElement;
  const text = textarea.value.trim();
  if (!text) return;

  state.userText = text;
  state.phase = "planning";
  setFormDisabled(true);
  showError("");
  clearReasoning();
  hideClarification();
  clearBlockList();

  try {
    const resp = await planFromNL({
      session_id: state.sessionId,
      user_text: state.userText,
      clarification_replies: state.clarificationReplies,
    });

    if (resp.reasoning) showReasoning(resp.reasoning);

    if (resp.needs_clarification) {
      state.clarificationQuestions = resp.questions;
      state.phase = "clarifying";
      renderClarification(resp.questions);
      setFormDisabled(false);
      return;
    }

    if (!resp.plan) {
      const errMsg = resp.validation_errors.map((e) => `${e.path}: ${e.message}`).join("\n");
      showError(errMsg || "Planner returned no plan.");
      state.phase = "idle";
      setFormDisabled(false);
      return;
    }

    state.currentPlan = resp.plan;
    state.phase = "confirming";
    renderPlanPreview(resp.plan);
    setFormDisabled(false);
  } catch (err) {
    showError(err instanceof ApiError ? err.message : String(err));
    state.phase = "idle";
    setFormDisabled(false);
  }
}

async function handleClarifySubmit(): Promise<void> {
  const replies = getClarificationReplies(state.clarificationQuestions.length);
  state.clarificationReplies = replies;
  hideClarification();
  await handlePlan();
}

async function handleExecute(dryRun: boolean): Promise<void> {
  if (!state.currentPlan) return;
  state.phase = "executing";

  const executeBtn = document.getElementById("execute-btn") as HTMLButtonElement;
  const dryRunBtn = document.getElementById("dry-run-btn") as HTMLButtonElement;
  executeBtn.disabled = true;
  dryRunBtn.disabled = true;

  // Set all steps to "running"
  state.traceSteps = state.currentPlan.steps.map((step, i) => ({
    index: i,
    skill_id: step.skill_id,
    arguments: step.arguments,
    status: "running" as const,
    detail: "",
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
  }));
  state.currentPlan.steps.forEach((_, i) => {
    updateStepStatus({ ...state.traceSteps[i] });
  });

  try {
    const resp = await executePlan({ plan: state.currentPlan, dry_run: dryRun });
    resp.trace.steps.forEach((step) => updateStepStatus(step));
    state.phase = "done";
  } catch (err) {
    showError(err instanceof ApiError ? err.message : String(err));
    state.phase = "done";
  }

  executeBtn.disabled = false;
  dryRunBtn.disabled = false;
}

async function handleFallbackExecute(): Promise<void> {
  try {
    const resp = await executeFallback();
    if (resp.trace.steps.length) {
      renderPlanPreview({
        plan_id: resp.trace.plan_id ?? undefined,
        steps: resp.trace.steps.map((s) => ({
          skill_id: s.skill_id,
          arguments: s.arguments,
        })),
      });
      resp.trace.steps.forEach((step) => updateStepStatus(step));
    }
  } catch (err) {
    showError(err instanceof ApiError ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Binding flow
// ---------------------------------------------------------------------------

async function handleBindingConfigure(): Promise<void> {
  const input = document.getElementById("binding-nl-input") as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;

  setBindingBtnDisabled(true);
  showBindingError("");

  try {
    const resp = await configureBindings({
      user_text: text,
      session_id: state.sessionId,
    });

    if (resp.validation_errors.length) {
      const msgs = resp.validation_errors.map((e) => `${e.path}: ${e.message}`).join("; ");
      showBindingError(`Some bindings had errors: ${msgs}`);
    }

    if (resp.bindings.length) {
      state.bindings = resp.bindings;
      renderBindings(state.bindings);
      input.value = "";
      if (resp.reasoning) {
        appendEventFeed(`K2: ${resp.reasoning}`);
      }
    } else if (!resp.validation_errors.length) {
      showBindingError("No bindings were returned.");
    }
  } catch (err) {
    showBindingError(err instanceof ApiError ? err.message : String(err));
  } finally {
    setBindingBtnDisabled(false);
  }
}

// ---------------------------------------------------------------------------
// Wire DOM events
// ---------------------------------------------------------------------------

function wireEvents(): void {
  document
    .getElementById("plan-btn")!
    .addEventListener("click", () => void handlePlan());

  document.getElementById("nl-input")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      void handlePlan();
    }
  });

  document
    .getElementById("clarify-submit-btn")!
    .addEventListener("click", () => void handleClarifySubmit());

  document
    .getElementById("execute-btn")!
    .addEventListener("click", () => void handleExecute(false));

  document
    .getElementById("dry-run-btn")!
    .addEventListener("click", () => void handleExecute(true));

  document.getElementById("discard-btn")!.addEventListener("click", () => {
    resetPlanFlow();
    clearBlockList();
    clearReasoning();
    hideClarification();
    showError("");
  });

  document
    .getElementById("binding-configure-btn")!
    .addEventListener("click", () => void handleBindingConfigure());

  document
    .getElementById("binding-nl-input")!
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") void handleBindingConfigure();
    });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

wireEvents();
void boot();
