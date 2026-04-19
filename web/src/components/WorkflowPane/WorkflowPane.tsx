import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Manifest } from "../../types";
import { api, ApiError } from "../../api";
import { applyTraceToStore, useStore } from "../../state/store";
import BlockList from "./BlockList";
import EmptyWorkflow from "./EmptyWorkflow";
import AddStepButton from "./AddStepButton";

interface Props {
  manifest: Manifest | null;
}

export default function WorkflowPane({ manifest }: Props) {
  const {
    plan,
    phase,
    stepStates,
    setPhase,
    setStepStates,
    patchStepState,
    pushTurn,
    setError,
  } = useStore();

  const runBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const isRunning = phase === "executing";
  const hasPlan = !!plan && plan.steps.length > 0;
  const stepCount = plan?.steps.length ?? 0;

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
  }, [phase, hasPlan]);

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
          {hasPlan && phase !== "executing" && phase !== "done" && "Ready to run."}
        </h2>
        <p className="text-sm text-graphite mt-2 max-w-xl">
          {!hasPlan &&
            "The planner is composing a workflow. It will appear here in a moment."}
          {hasPlan &&
            phase !== "executing" &&
            phase !== "done" &&
            "Hit Run below. Scroll up any time to inspect or fine-tune individual steps."}
          {hasPlan && phase === "executing" && "Each step lights up as it executes."}
          {hasPlan && phase === "done" && "Run again, tweak a step, or describe a new interaction."}
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

      {/* Big sticky Run CTA — the default action, always visible */}
      <div className="border-t border-rule bg-cream">
        {hasPlan ? (
          <div className="px-8 py-5 flex items-center gap-6">
            <div className="flex-1 min-w-0">
              <p className="eyebrow text-sage">
                {phase === "executing"
                  ? "Executing"
                  : phase === "done"
                    ? "Finished"
                    : "Ready"}
              </p>
              <p className="font-display text-[22px] leading-tight mt-1 text-ink truncate">
                {phase === "executing"
                  ? "Running on the arm…"
                  : phase === "done"
                    ? "Run again or refine."
                    : `${stepCount} step${stepCount === 1 ? "" : "s"} composed`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => runMut.mutate({ dryRun: true })}
              disabled={!hasPlan || isRunning}
              className="btn-ghost shrink-0"
            >
              Dry run
            </button>
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
