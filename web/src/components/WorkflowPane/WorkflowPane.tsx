import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Manifest } from "../../types";
import { api, ApiError } from "../../api";
import { applyTraceToStore, useStore } from "../../state/store";
import { bindingDisplayName, bindingIdFor, describeTrigger } from "../../lib/friendly";
import BlockList from "./BlockList";
import EmptyWorkflow from "./EmptyWorkflow";
import AddStepButton from "./AddStepButton";
import LiveTranscript from "./LiveTranscript";

interface Props {
  manifest: Manifest | null;
}

// Fire-triggered animation timing. Each step gets a "running" pulse for this
// many ms before flipping to "completed". Picked to feel snappy but readable.
const FIRE_STEP_MS = 550;

export default function WorkflowPane({ manifest }: Props) {
  const {
    plan,
    phase,
    stepStates,
    suggestedTrigger,
    activeBindingId,
    lastUserText,
    recentFires,
    setPhase,
    setStepStates,
    patchStepState,
    setActiveBindingId,
    pushTurn,
    setError,
  } = useStore();

  const runBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks the last fire id we've animated so we never replay the same one
  // twice (and so the very first snapshot of pre-existing fires doesn't kick
  // off a phantom animation when the user arms a trigger).
  const lastAnimatedFireId = useRef<string | null>(null);
  // Holds setTimeout ids for the in-flight fire animation so we can cancel
  // cleanly on unmount or if a new fire lands mid-animation.
  const fireTimers = useRef<number[]>([]);

  const runMut = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      if (!plan) throw new Error("No plan");
      setStepStates(plan.steps.map(() => ({ status: "pending", detail: "" })));

      // Optimistic sequential lighting while the request is in flight.
      const cancellers: number[] = [];
      plan.steps.forEach((_, i) => {
        const id = window.setTimeout(() => {
          patchStepState(i, { status: "running" });
        }, i * 350);
        cancellers.push(id);
      });

      try {
        const res = await api.execute({ plan, dry_run: dryRun });
        cancellers.forEach((id) => window.clearTimeout(id));
        return res;
      } catch (err) {
        cancellers.forEach((id) => window.clearTimeout(id));
        throw err;
      }
    },
    onMutate: () => {
      setPhase("executing");
      setError(null);
    },
    onSuccess: (resp) => {
      applyTraceToStore(resp.trace.steps);
      setPhase("done");
      const failed = resp.trace.steps.filter((s) => s.status === "failed").length;
      pushTurn({
        role: "assistant",
        kind: "summary",
        text: failed
          ? `Run finished with ${failed} failed step${failed === 1 ? "" : "s"}.`
          : `All ${resp.trace.steps.length} step${
              resp.trace.steps.length === 1 ? "" : "s"
            } completed cleanly.`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : String(err);
      setError(msg);
      setPhase("error");
      pushTurn({ role: "assistant", kind: "error", text: msg });
    },
  });

  // Install the current plan as a hot-reloaded binding on the companion so
  // the dispatcher fires it whenever the suggested trigger event arrives.
  // For speech triggers we also explicitly open the microphone — it stays
  // closed by default so the OS recording-indicator only lights up while
  // the user has asked the platform to listen.
  const armMut = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("No plan");
      if (!suggestedTrigger) throw new Error("No suggested trigger");
      const userText = lastUserText ?? "";
      const binding = {
        binding_id: bindingIdFor(suggestedTrigger, userText),
        display_name: bindingDisplayName(suggestedTrigger, userText),
        trigger: suggestedTrigger,
        plan,
      };
      // Snapshot whatever fire id is currently latest for this binding so the
      // animation effect ignores anything that was already in the buffer at
      // arm time. `null` means "no prior fire" — in that case, the very next
      // fire to arrive should animate.
      const ours = useStore
        .getState()
        .recentFires.filter((f) => f.binding_id === binding.binding_id);
      lastAnimatedFireId.current =
        ours.length > 0 ? ours[ours.length - 1].id : null;

      await api.addBinding(binding);
      if (binding.trigger.type === "speech") {
        try {
          await api.setSpeechListening(true);
        } catch (err) {
          // Non-fatal: binding is still active, the dispatcher will fire it
          // if events come in via POST /events. Surface as a toast so the
          // user knows the mic isn't open.
          const msg = err instanceof ApiError ? err.message : String(err);
          pushTurn({
            role: "assistant",
            kind: "error",
            text: `Binding is armed, but the local microphone couldn't be opened: ${msg}`,
          });
        }
      }
      return binding;
    },
    onMutate: () => setError(null),
    onSuccess: (binding) => {
      setActiveBindingId(binding.binding_id);
      setPhase("armed");
      // Reset block lights so the user sees a clean slate that will animate
      // on the next fire.
      if (plan) {
        setStepStates(plan.steps.map(() => ({ status: "pending", detail: "" })));
      }
      pushTurn({
        role: "assistant",
        kind: "summary",
        text: `Listening. The arm will run this whenever ${describeTrigger(binding.trigger)}.`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : String(err);
      setError(msg);
      pushTurn({ role: "assistant", kind: "error", text: msg });
    },
  });

  const disarmMut = useMutation({
    mutationFn: async () => {
      if (!activeBindingId) throw new Error("No active binding");
      await api.deleteBinding(activeBindingId);
      // Close the mic too — even if there are other bindings later, those
      // will re-open it via their own arm path. The user's mental model is
      // "Stop = mic off".
      if (suggestedTrigger?.type === "speech") {
        try {
          await api.setSpeechListening(false);
        } catch {
          /* non-fatal — adapter may already be closed */
        }
      }
      return activeBindingId;
    },
    onSuccess: () => {
      setActiveBindingId(null);
      setPhase("ready");
      // Cancel any pending fire-animation timers so step states freeze.
      fireTimers.current.forEach((id) => window.clearTimeout(id));
      fireTimers.current = [];
      pushTurn({
        role: "assistant",
        kind: "summary",
        text: "Stopped listening. The trigger is no longer armed.",
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : String(err);
      setError(msg);
      pushTurn({ role: "assistant", kind: "error", text: msg });
    },
  });

  // Watch for new fires of the currently-armed binding and play the same
  // step-by-step lighting animation as a manual Run. Server-side execution
  // is independent of this; we're just visualising it for the user.
  useEffect(() => {
    if (!activeBindingId || !plan) return;
    const ours = recentFires.filter((f) => f.binding_id === activeBindingId);
    const latest = ours[ours.length - 1];
    if (!latest) return;
    if (latest.id === lastAnimatedFireId.current) return;
    lastAnimatedFireId.current = latest.id;

    // Cancel any in-flight animation (back-to-back fires) and start fresh.
    fireTimers.current.forEach((id) => window.clearTimeout(id));
    fireTimers.current = [];

    const steps = plan.steps;
    setStepStates(steps.map(() => ({ status: "pending", detail: "" })));
    setPhase("executing");

    steps.forEach((_, i) => {
      const startId = window.setTimeout(() => {
        patchStepState(i, { status: "running" });
      }, i * FIRE_STEP_MS);
      const doneId = window.setTimeout(
        () => {
          patchStepState(i, {
            status: latest.ok ? "completed" : i === 0 ? "failed" : "skipped",
            detail: latest.ok ? "" : latest.detail || "fired",
          });
        },
        i * FIRE_STEP_MS + FIRE_STEP_MS,
      );
      fireTimers.current.push(startId, doneId);
    });

    const finishId = window.setTimeout(
      () => {
        // Return to the armed state so "Stop" remains the primary CTA.
        setPhase("armed");
      },
      steps.length * FIRE_STEP_MS + 200,
    );
    fireTimers.current.push(finishId);

    pushTurn({
      role: "assistant",
      kind: "summary",
      text: latest.ok
        ? `Triggered — ran ${steps.length} step${steps.length === 1 ? "" : "s"}.`
        : `Triggered — failed: ${latest.detail || "see log"}.`,
    });
    // We intentionally exclude `pushTurn`/`patchStepState`/`setPhase`/
    // `setStepStates` from deps — they are stable zustand action refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentFires, activeBindingId, plan]);

  // Cancel pending animation timers on unmount.
  useEffect(() => {
    return () => {
      fireTimers.current.forEach((id) => window.clearTimeout(id));
      fireTimers.current = [];
    };
  }, []);

  const isRunning = phase === "executing";
  const isArming = armMut.isPending;
  const isDisarming = disarmMut.isPending;
  const hasPlan = !!plan && plan.steps.length > 0;
  const stepCount = plan?.steps.length ?? 0;
  const hasTrigger = !!suggestedTrigger;
  const isArmed = !!activeBindingId;

  // When a plan becomes ready, focus the Run button so Enter triggers it
  // immediately, and reset the block scroll to the top so the steps read in
  // natural order if the user looks up.
  useEffect(() => {
    if (phase === "ready" && hasPlan) {
      scrollRef.current?.scrollTo({ top: 0 });
      // Slight delay lets layout settle before focusing.
      const id = window.setTimeout(() => runBtnRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [phase, hasPlan, hasTrigger]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-7 pb-5 hairline border-x-0 border-t-0 bg-linen">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-5 bg-sage" />
          <p className="eyebrow text-sage">Workflow</p>
          <span className="ml-2 font-mono text-[11px] text-mute">
            {stepCount} step{stepCount === 1 ? "" : "s"}
          </span>
        </div>
        <h2 className="display text-3xl mt-2">
          {!hasPlan && "Composing…"}
          {hasPlan && phase === "executing" && "Running."}
          {hasPlan && phase === "done" && "Done."}
          {hasPlan && phase === "armed" && "Listening."}
          {hasPlan &&
            phase !== "executing" &&
            phase !== "done" &&
            phase !== "armed" &&
            (hasTrigger ? "Ready to arm." : "Ready to run.")}
        </h2>
        <p className="text-sm text-graphite mt-2 max-w-xl">
          {!hasPlan &&
            "The planner is composing a workflow. It will appear here in a moment."}
          {hasPlan &&
            phase !== "executing" &&
            phase !== "done" &&
            phase !== "armed" &&
            (hasTrigger
              ? `Activate the trigger below — it will fire whenever ${describeTrigger(suggestedTrigger!)}. Scroll up to inspect the steps first if you like.`
              : "Hit Run below. Scroll up any time to inspect or fine-tune individual steps.")}
          {hasPlan && phase === "executing" && "Each step lights up as it executes."}
          {hasPlan && phase === "done" && "Run again, tweak a step, or describe a new interaction."}
          {hasPlan && phase === "armed" && suggestedTrigger &&
            `The arm is listening for when ${describeTrigger(suggestedTrigger)}. Each fire will animate through the blocks below — you can also trigger it manually to test.`}
        </p>
      </div>

      {/* Scrollable block area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
        {hasPlan ? (
          <BlockList
            plan={plan!}
            stepStates={stepStates}
            manifest={manifest}
            disabled={isRunning}
          />
        ) : (
          <EmptyWorkflow />
        )}

        {hasPlan && (
          <div className="mt-6">
            <AddStepButton manifest={manifest} disabled={isRunning} />
          </div>
        )}
      </div>

      {/* Live transcription / activity feed — only shown when a trigger is in
          play, since that's when the user wants to confirm the mic is alive. */}
      {hasPlan && hasTrigger && suggestedTrigger && (
        <LiveTranscript
          trigger={suggestedTrigger}
          isArmed={isArmed}
          isToggling={isArming || isDisarming}
        />
      )}

      {/* Big sticky CTA — context-sensitive: Activate when a trigger was
          suggested, Run otherwise. */}
      <div className="border-t border-rule bg-cream">
        {hasPlan ? (
          <div className="px-8 py-5 flex items-center gap-6">
            <div className="flex-1 min-w-0">
              <p
                className={`eyebrow ${
                  isArmed ? "text-moss" : hasTrigger ? "text-sky" : "text-sage"
                }`}
              >
                {phase === "executing"
                  ? "Executing"
                  : phase === "done"
                    ? "Finished"
                    : isArmed
                      ? "Listening"
                      : hasTrigger
                        ? "Trigger ready"
                        : "Ready"}
              </p>
              <p className="font-display text-[22px] leading-tight mt-1 text-ink truncate">
                {phase === "executing"
                  ? "Running on the arm…"
                  : phase === "done"
                    ? "Run again or refine."
                    : isArmed && suggestedTrigger
                      ? `Listening for when ${describeTrigger(suggestedTrigger)}.`
                      : hasTrigger && suggestedTrigger
                        ? `Will fire when ${describeTrigger(suggestedTrigger)}`
                        : `${stepCount} step${stepCount === 1 ? "" : "s"} composed`}
              </p>
            </div>

            {/* Secondary actions */}
            {hasTrigger && (
              <button
                type="button"
                onClick={() => runMut.mutate({ dryRun: false })}
                disabled={isRunning || isArming || isDisarming}
                className="btn-ghost shrink-0"
                title="Fire the plan once now without waiting for the trigger"
              >
                {isRunning ? "Running…" : "Trigger manually"}
              </button>
            )}
            {!hasTrigger && (
              <button
                type="button"
                onClick={() => runMut.mutate({ dryRun: true })}
                disabled={isRunning}
                className="btn-ghost shrink-0"
              >
                Dry run
              </button>
            )}

            {/* Primary action — Start / Stop / Run */}
            {hasTrigger && !isArmed && (
              <button
                ref={runBtnRef}
                type="button"
                onClick={() => armMut.mutate()}
                disabled={isArming || isRunning}
                className="shrink-0 hairline bg-sky text-cream px-10 py-4 font-display text-[24px] tracking-tight transition-colors hover:bg-ink focus:outline-none focus:ring-2 focus:ring-sky focus:ring-offset-2 focus:ring-offset-cream disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              >
                {isArming ? "Starting…" : "Start"}
              </button>
            )}
            {hasTrigger && isArmed && (
              <button
                ref={runBtnRef}
                type="button"
                onClick={() => disarmMut.mutate()}
                disabled={isDisarming}
                className="shrink-0 hairline bg-ink text-cream px-10 py-4 font-display text-[24px] tracking-tight transition-colors hover:bg-clay focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 focus:ring-offset-cream disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDisarming ? "Stopping…" : "Stop"}
              </button>
            )}
            {!hasTrigger && (
              <button
                ref={runBtnRef}
                type="button"
                onClick={() => runMut.mutate({ dryRun: false })}
                disabled={!hasPlan || isRunning}
                className="shrink-0 hairline bg-clay text-cream px-10 py-4 font-display text-[24px] tracking-tight transition-colors hover:bg-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 focus:ring-offset-cream disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              >
                {isRunning ? "Running…" : phase === "done" ? "Run again →" : "Run →"}
              </button>
            )}
          </div>
        ) : (
          <div className="px-8 py-5 flex items-center justify-between text-[12px] text-mute">
            <span className="eyebrow">{phase === "planning" ? "Composing…" : "Idle"}</span>
            <span className="font-mono">awaiting plan</span>
          </div>
        )}
      </div>
    </div>
  );
}
