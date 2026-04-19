import { useState } from "react";

interface Props {
  questions: string[];
  onSubmit: (replies: string[]) => void;
  disabled?: boolean;
}

export default function ClarificationCard({ questions, onSubmit, disabled }: Props) {
  const [replies, setReplies] = useState<string[]>(() => questions.map(() => ""));

  function setReply(i: number, value: string) {
    setReplies((r) => r.map((v, idx) => (idx === i ? value : v)));
  }

  function submit() {
    if (disabled) return;
    if (replies.some((r) => !r.trim())) return;
    onSubmit(replies.map((r) => r.trim()));
  }

  return (
    <div className="mt-6 hairline bg-paper p-5 animate-fadeUp">
      <p className="eyebrow mb-4">A few quick questions</p>
      <div className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <div key={i} className="flex flex-col gap-2">
            <label className="font-display italic text-lg text-ink leading-snug">
              {i + 1}. {q}
            </label>
            <input
              type="text"
              value={replies[i]}
              onChange={(e) => setReply(i, e.target.value)}
              className="field"
              placeholder="Your answer…"
              disabled={disabled}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-5">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || replies.some((r) => !r.trim())}
          className="btn-primary"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
