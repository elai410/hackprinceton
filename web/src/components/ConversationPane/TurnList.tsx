import type { Turn } from "../../state/store";

interface Props {
  turns: Turn[];
}

export default function TurnList({ turns }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {turns.map((t) => (
        <TurnItem key={t.id} turn={t} />
      ))}
    </div>
  );
}

function TurnItem({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex flex-col gap-2 animate-fadeUp">
        <span className="eyebrow text-clay">You</span>
        <div className="hairline-soft bg-sand/60 px-4 py-3">
          <p className="text-[15px] text-ink whitespace-pre-wrap leading-relaxed">{turn.text}</p>
        </div>
      </div>
    );
  }

  // assistant
  switch (turn.kind) {
    case "reasoning":
      return (
        <div className="flex flex-col gap-2 animate-fadeUp">
          <span className="eyebrow text-sky">K2 · Reasoning</span>
          <blockquote className="border-l-2 border-sky pl-4 pr-2 py-1 font-display italic text-[17px] leading-snug text-plum whitespace-pre-wrap">
            {turn.text}
          </blockquote>
        </div>
      );
    case "summary":
      return (
        <div className="flex flex-col gap-1 animate-fadeUp">
          <span className="eyebrow text-sage">Planner</span>
          <p className="text-[15px] text-ink leading-relaxed">{turn.text}</p>
        </div>
      );
    case "clarification":
      return (
        <div className="flex flex-col gap-1 animate-fadeUp">
          <span className="eyebrow text-clay">Planner · Clarification</span>
          <p className="text-[15px] text-ink leading-relaxed">{turn.text}</p>
        </div>
      );
    case "error":
      return (
        <div className="flex flex-col gap-1 animate-fadeUp">
          <span className="eyebrow text-rust">Error</span>
          <p className="text-[14px] text-rust whitespace-pre-wrap font-mono">{turn.text}</p>
        </div>
      );
    default:
      return (
        <div className="animate-fadeUp">
          <p className="text-[15px] text-ink whitespace-pre-wrap">{turn.text}</p>
        </div>
      );
  }
}
