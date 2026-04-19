import { useEffect, useRef, useState } from "react";

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  size?: "default" | "hero";
}

export default function Composer({
  onSubmit,
  disabled,
  placeholder = "Describe a behavior — e.g. 'wave hello, then return home'",
  size = "default",
}: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const isHero = size === "hero";

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const max = isHero ? 240 : 160;
    const min = isHero ? 88 : 48;
    ta.style.height = Math.min(max, Math.max(min, ta.scrollHeight)) + "px";
  }, [text, isHero]);

  function submit() {
    if (disabled) return;
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (isHero) {
    return (
      <div className="bg-paper">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus
          className="w-full bg-paper px-5 py-4 font-display text-[24px] leading-snug text-ink placeholder:text-mute placeholder:italic resize-none focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-hair gap-3">
          <span className="text-[11px] text-mute">
            <kbd className="font-mono">Enter</kbd> to send ·{" "}
            <kbd className="font-mono">Shift+Enter</kbd> for newline
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="btn-primary"
          >
            Compose &rarr;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1 hairline bg-paper">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-mute resize-none focus:outline-none disabled:opacity-50"
        />
        <div className="px-3 py-2 border-t border-hair">
          <span className="text-[11px] text-mute">
            <kbd className="font-mono">Enter</kbd> to send ·{" "}
            <kbd className="font-mono">Shift+Enter</kbd> for newline
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="btn-primary"
      >
        Send
      </button>
    </div>
  );
}
