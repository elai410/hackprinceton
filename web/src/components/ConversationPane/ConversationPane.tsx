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

const TRIGGER_EXAMPLES = [
  { trigger: "When you hear \u201Chello\u201D", action: "wave three times.", accent: "clay" },
  { trigger: "When I clap twice", action: "return to the home pose.", accent: "sage" },
  { trigger: "When I say \u201Cshow off\u201D", action: "sweep the base slowly left to right.", accent: "sky" },
  { trigger: "When you hear \u201Cgoodnight\u201D", action: "show \u201CGoodnight\u201D on the OLED and lower the arm.", accent: "plum" },
] as const;

const ACCENT_TEXT: Record<string, string> = {
  clay: "text-clay",
  sage: "text-sage",
  sky: "text-sky",
  plum: "text-plum",
};
const ACCENT_BG: Record<string, string> = {
  clay: "bg-clay",
  sage: "bg-sage",
  sky: "bg-sky",
  plum: "bg-plum",
};

export default function ConversationPane({ manifest, mode }: Props) {
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
            <span className="eyebrow text-clay">New interaction</span>
            <h2 className="display text-[44px] sm:text-[56px] leading-[0.95]">
              Tell{" "}
              <span className="italic text-graphite">
                {manifest?.robot_label ?? "the arm"}
              </span>{" "}
              how it should respond.
            </h2>
            <p className="text-[15px] text-graphite max-w-2xl leading-relaxed mt-2">
              Pair a <span className="text-clay">trigger</span> with a{" "}
              <span className="text-sage">behavior</span> in plain language. The
              planner composes a runnable workflow in seconds.
            </p>
          </div>

          <div className="hairline bg-paper p-2 sm:p-3 shadow-[8px_8px_0_0_#E8DCC4]">
            <Composer
              onSubmit={handleSubmit}
              disabled={planMut.isPending}
              placeholder="e.g. when you hear &lsquo;hello&rsquo;, wave three times"
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
                    <span className={`w-1.5 h-8 ${ACCENT_BG[ex.accent]} shrink-0`} />
                    <span className="flex-1 font-display text-[19px] leading-snug text-ink">
                      <span className={`${ACCENT_TEXT[ex.accent]} italic`}>{ex.trigger}</span>
                      <span className="text-graphite">, </span>
                      <span className="italic">{ex.action}</span>
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
          Refine or describe a new interaction.
        </h2>
        <p className="text-sm text-graphite mt-2 max-w-xl">
          The composed workflow is on the right. Send another message to adjust it
          or start fresh.
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
