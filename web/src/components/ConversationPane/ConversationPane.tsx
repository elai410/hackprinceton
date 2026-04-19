import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Manifest, PlanRequest } from "../../types";
import { api, ApiError } from "../../api";
import { useStore } from "../../state/store";
import { describeTrigger } from "../../lib/friendly";
import Composer from "./Composer";
import TurnList from "./TurnList";
import ClarificationCard from "./ClarificationCard";

interface Props {
  manifest: Manifest | null;
  mode: "hero" | "compact";
}

// Each example showcases a different axis of the platform:
//   1. speech trigger + explicit multi-step routine
//   2. key trigger + vague affective prompt (planner improvises a routine)
//   3. speech trigger + vague vibe (planner composes a 3-step expression)
//   4. key trigger + vague social prompt (planner picks tasteful sequence)
//
// Coloring across all four is intentionally uniform: trigger text in clay,
// action text in sage. This mirrors the Trigger / Behavior legend at the
// bottom of the hero so the colors actually mean something instead of just
// rotating decoratively.
const TRIGGER_EXAMPLES = [
  { trigger: "When you hear \u201Chello\u201D", action: "wave and greet me on the screen." },
  { trigger: "When I press the \u201Ck\u201D key", action: "look sad." },
  { trigger: "When you hear \u201Cquestion\u201D", action: "answer like Rocky." },
  { trigger: "When I press the spacebar", action: "show off." },
] as const;

export default function ConversationPane({ manifest: _manifest, mode }: Props) {
  const {
    sessionId,
    turns,
    pendingClarification,
    pushTurn,
    setPhase,
    setPlan,
    setClarification,
    setModelUsed,
    setError,
    setLastUserText,
    setSuggestedTrigger,
    setActiveBindingId,
    phase,
    planHistory,
    appendPlanHistory,
  } = useStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, phase]);

  const planMut = useMutation({
    mutationFn: (req: PlanRequest) => api.plan(req),
    onMutate: () => {
      setPhase("planning");
      setError(null);
    },
    onSuccess: (resp, variables) => {
      setModelUsed(resp.model_used);
      if (resp.reasoning) {
        pushTurn({ role: "assistant", kind: "reasoning", text: resp.reasoning });
      }
      if (resp.needs_clarification) {
        setClarification(resp.questions);
        pushTurn({
          role: "assistant",
          kind: "clarification",
          text: "I need a bit more detail before I can plan this.",
          questions: resp.questions,
        });
        setPhase("clarifying");
        // Intentionally do NOT append to planHistory here — wait until the
        // clarification round actually produces a plan, then collapse the
        // whole round into a single history entry below.
        return;
      }
      if (!resp.plan) {
        const msg =
          resp.validation_errors.map((e) => `${e.path}: ${e.message}`).join("\n") ||
          "I couldn't produce a valid plan.";
        pushTurn({ role: "assistant", kind: "error", text: msg });
        setError(msg);
        setPhase("error");
        return;
      }
      setPlan(resp.plan);
      setClarification(null);
      const trigger = resp.suggested_trigger ?? null;
      setSuggestedTrigger(trigger);
      // A fresh plan supersedes any previously-armed binding from this session.
      setActiveBindingId(null);
      const stepWord = `${resp.plan.steps.length} step${
        resp.plan.steps.length === 1 ? "" : "s"
      }`;
      pushTurn({
        role: "assistant",
        kind: "summary",
        text: trigger
          ? `Workflow ready — ${stepWord}. Activate the trigger on the right and it will fire whenever ${describeTrigger(trigger)}.`
          : `Workflow ready — ${stepWord}. Hit Run on the right.`,
      });
      // Record the resolved turn so subsequent /plan calls can edit it
      // instead of restarting from the new instruction alone. Read the
      // exact user_text + clarification_replies from `variables` (the
      // payload we just sent) so concurrent submissions can't desync.
      appendPlanHistory({
        user_text: variables.user_text,
        clarification_replies: variables.clarification_replies,
        reasoning: resp.reasoning || null,
        plan: resp.plan,
        suggested_trigger: trigger,
      });
      setPhase("ready");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushTurn({ role: "assistant", kind: "error", text: msg });
      setError(msg);
      setPhase("error");
    },
  });

  function handleSubmit(text: string) {
    if (!text.trim()) return;
    setLastUserText(text);
    pushTurn({ role: "user", kind: "message", text });
    planMut.mutate({
      session_id: sessionId,
      user_text: text,
      clarification_replies: [],
      history: planHistory,
    });
  }

  function handleClarificationSubmit(replies: string[]) {
    const lastUserTurn = [...turns].reverse().find((t) => t.role === "user");
    const userText = lastUserTurn?.text ?? "";
    pushTurn({
      role: "user",
      kind: "message",
      text: replies.map((r, i) => `${i + 1}. ${r}`).join("\n"),
    });
    setClarification(null);
    planMut.mutate({
      session_id: sessionId,
      user_text: userText,
      clarification_replies: replies,
      history: planHistory,
    });
  }

  if (mode === "hero") {
    return (
      <div className="relative flex flex-col items-center px-6 py-16 lg:py-24 animate-fadeUp overflow-hidden">
        {/* decorative editorial side bars */}
        <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-2 bg-clay" aria-hidden />
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-2 bg-sage" aria-hidden />
        <div
          className="hidden xl:block absolute left-12 top-24 bottom-24 w-px bg-hair"
          aria-hidden
        />
        <div
          className="hidden xl:block absolute right-12 top-24 bottom-24 w-px bg-hair"
          aria-hidden
        />

        <div className="relative w-full max-w-3xl flex flex-col gap-10">
          <div className="flex flex-col items-start gap-3">
            <span className="eyebrow text-clay">The control layer for consumer robotics</span>
            <h2 className="display text-[44px] sm:text-[56px] leading-[0.95]">
              Reprogram the physical world with{" "}
              <span className="italic text-graphite">natural language.</span>
            </h2>
            <p className="text-[15px] text-graphite max-w-2xl leading-relaxed mt-2">
              ReWire is the AI-native control layer that lets anyone change the
              behavior of machines with just a sentence. Wire any input —{" "}
              <span className="text-clay">voice</span>,{" "}
              <span className="text-clay">keystroke</span>,{" "}
              <span className="text-clay">sensor</span> — to any robot's{" "}
              <span className="text-sage">capabilities</span>. No SDK required.
            </p>
          </div>

          <div className="hairline bg-paper p-2 sm:p-3 shadow-[8px_8px_0_0_#E8DCC4]">
            <Composer
              onSubmit={handleSubmit}
              disabled={planMut.isPending}
              placeholder="e.g. when you hear &lsquo;hello&rsquo;, wave and greet me on the screen"
              size="hero"
            />
          </div>

          <div>
            <p className="eyebrow text-sage mb-4">Try saying</p>
            <ul className="hairline-soft border-x-0 divide-y divide-hair">
              {TRIGGER_EXAMPLES.map((ex) => (
                <li key={ex.trigger}>
                  <button
                    type="button"
                    onClick={() => handleSubmit(`${ex.trigger}, ${ex.action}`)}
                    className="w-full text-left px-4 py-5 hover:bg-paper transition-colors flex items-center gap-5"
                  >
                    <span className="flex-1 font-display text-[19px] leading-snug text-ink">
                      <span className="text-clay italic">{ex.trigger}</span>
                      <span className="text-graphite">, </span>
                      <span className="text-sage italic">{ex.action}</span>
                    </span>
                    <span className="eyebrow shrink-0 text-mute group-hover:text-ink">Use &rarr;</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-6 text-[11px] uppercase tracking-widest2 text-mute pt-4 border-t border-hair">
            <span>
              <span className="text-clay">●</span> Trigger
            </span>
            <span>
              <span className="text-sage">●</span> Behavior
            </span>
            <span>
              <span className="text-sky">●</span> Reasoning
            </span>
            <span>
              <span className="text-moss">●</span> Run
            </span>
          </div>
        </div>
      </div>
    );
  }

  // compact (split view)
  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-8 pb-4 hairline border-x-0 border-t-0 bg-cream">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-5 bg-clay" />
          <p className="eyebrow text-clay">Conversation</p>
        </div>
        <h2 className="display text-3xl mt-2">
          Reprogram a behavior, or wire a new one.
        </h2>
        <p className="text-sm text-graphite mt-2 max-w-xl">
          The composed workflow is on the right. Send another message to refine
          the routine in plain English, or describe a new one from scratch.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
        <TurnList turns={turns} />
        {pendingClarification && (
          <ClarificationCard
            questions={pendingClarification.questions}
            onSubmit={handleClarificationSubmit}
            disabled={planMut.isPending}
          />
        )}
      </div>

      <div className="hairline border-x-0 border-b-0 px-8 py-5 bg-cream">
        <Composer
          onSubmit={handleSubmit}
          disabled={planMut.isPending || phase === "executing"}
          placeholder="Refine, add a trigger, or describe a new interaction…"
        />
      </div>
    </div>
  );
}
