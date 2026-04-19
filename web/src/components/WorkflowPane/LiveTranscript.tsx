import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useStore } from "../../state/store";
import type { RecentEvent, TriggerPattern } from "../../types";

interface Props {
  /** The trigger this view is "tuned" to — used to highlight matching
   *  keywords in incoming transcripts. */
  trigger: TriggerPattern;
  /** True iff the user has armed the trigger (mic should be open and we
   *  should be expecting transcripts). */
  isArmed: boolean;
  /** True while the user-driven arm/disarm RPC is in flight. */
  isToggling: boolean;
}

/**
 * Live, push-driven view of recent input events for the suggested trigger.
 *
 * The data comes from the global SSE store (see `useEventStream`), so frames
 * arrive on the same TCP connection the dispatcher recorded them on — there's
 * no polling lag between "the mic heard you" and "the chip lights up here".
 */
export default function LiveTranscript({ trigger, isArmed, isToggling }: Props) {
  const allEvents = useStore((s) => s.recentEvents);
  const connected = useStore((s) => s.eventsConnected);

  // Collapsed by default — the transcript is mostly a debugging affordance,
  // and keeping it folded gives the workflow blocks above more breathing room.
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  // Only show events whose type matches the trigger we care about. Other
  // event types (key, clap) still arrive in the store but they shouldn't
  // pollute the transcript view.
  const visible = useMemo(
    () => allEvents.filter((e) => e.type === trigger.type).slice(-6),
    [allEvents, trigger.type],
  );

  const keyword = useMemo(() => extractKeyword(trigger), [trigger]);
  const lastEventId = visible.length > 0 ? visible[visible.length - 1].id : null;

  // Auto-expand exactly once per arm-cycle the first time we see a match,
  // so the user gets visual confirmation the trigger fired even if they
  // hadn't opened the transcript. Reset the latch when the binding is
  // disarmed so the next arm-cycle gets the same one-shot behaviour.
  const autoExpandedThisCycle = useRef(false);
  useEffect(() => {
    if (!isArmed) {
      autoExpandedThisCycle.current = false;
      return;
    }
    if (autoExpandedThisCycle.current) return;
    if (!keyword) return;
    const lastEvent = visible[visible.length - 1];
    if (!lastEvent) return;
    const text = String(lastEvent.payload.text ?? lastEvent.payload.normalized ?? "");
    const normalized = String(lastEvent.payload.normalized ?? text).toLowerCase();
    if (normalized.includes(keyword.toLowerCase())) {
      autoExpandedThisCycle.current = true;
      setExpanded(true);
    }
  }, [visible, keyword, isArmed]);

  // Header status — three states, decided in priority order.
  let statusLabel: string;
  let statusTone: "active" | "idle" | "offline";
  if (!connected) {
    statusLabel = "Reconnecting…";
    statusTone = "offline";
  } else if (isToggling) {
    statusLabel = isArmed ? "Stopping…" : "Starting…";
    statusTone = "idle";
  } else if (isArmed) {
    statusLabel = trigger.type === "speech" ? "Listening" : `Listening — ${trigger.type}`;
    statusTone = "active";
  } else {
    statusLabel = trigger.type === "speech" ? "Microphone idle" : "Idle";
    statusTone = "idle";
  }

  return (
    <div className="mx-8 mb-3">
      <div className="hairline-soft bg-paper">
        {/* Header row — also the toggle. Status dot + label remain visible
            when collapsed so the user always sees whether listening is on. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className={`w-full px-4 py-2 flex items-center justify-between text-left ${
            expanded ? "border-b border-hair" : ""
          } focus:outline-none focus-visible:ring-2 focus-visible:ring-sand`}
        >
          <div className="flex items-center gap-2.5">
            <span className="relative inline-flex w-2 h-2">
              {statusTone === "active" && (
                <span className="absolute inset-0 bg-clay mic-pulse" aria-hidden />
              )}
              <span
                className={`relative inline-block w-2 h-2 ${
                  statusTone === "active"
                    ? "bg-clay"
                    : statusTone === "offline"
                      ? "bg-mute"
                      : "bg-mute/60"
                }`}
              />
            </span>
            <span
              className={`eyebrow ${
                statusTone === "active" ? "text-clay" : "text-graphite"
              }`}
            >
              {statusLabel}
            </span>
            {keyword && (
              <span className="font-mono text-[11px] text-graphite">
                {isArmed ? "waiting for" : "will wait for"} &ldquo;{keyword}&rdquo;
              </span>
            )}
          </div>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-mute">
              {connected ? "live · push" : "—"}
            </span>
            <Chevron open={expanded} />
          </span>
        </button>

        {/* Body */}
        {expanded && (
        <div id={bodyId} className="px-4 py-3 min-h-[68px]">
          {!connected && (
            <p className="text-[12px] text-mute">
              Trying to reach the companion event stream…
            </p>
          )}

          {connected && !isArmed && visible.length === 0 && (
            <p className="text-[13px] text-mute italic">
              {trigger.type === "speech"
                ? "Press Start below to open the microphone — transcripts will appear here as you speak."
                : "Press Start below to begin listening for this trigger."}
            </p>
          )}

          {connected && isArmed && visible.length === 0 && (
            <p className="text-[13px] text-mute italic">
              {trigger.type === "speech"
                ? "Listening… say something to see it transcribed in real time."
                : "Listening for events…"}
            </p>
          )}

          {connected && visible.length > 0 && (
            <ul className="space-y-1.5">
              {visible.map((ev) => (
                <TranscriptRow
                  key={ev.id}
                  event={ev}
                  keyword={keyword}
                  isLatest={ev.id === lastEventId}
                />
              ))}
            </ul>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden
      className={`text-mute transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M3 1.5 L7 5 L3 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TranscriptRow({
  event,
  keyword,
  isLatest,
}: {
  event: RecentEvent;
  keyword: string | null;
  isLatest: boolean;
}) {
  const text = String(event.payload.text ?? event.payload.normalized ?? "");
  const normalized = String(event.payload.normalized ?? text).toLowerCase();
  const matched = !!(keyword && normalized.includes(keyword.toLowerCase()));
  const time = formatTime(event.timestamp);

  return (
    <li
      className={`flex items-start gap-3 text-[13px] leading-snug ${
        isLatest ? "row-flash" : ""
      }`}
    >
      <span className="font-mono text-[10px] text-mute shrink-0 mt-1">
        {time}
      </span>
      <span
        className={`flex-1 break-words ${
          matched ? "text-ink font-medium" : "text-graphite"
        }`}
      >
        {keyword ? renderHighlighted(text, keyword) : text}
      </span>
      {matched && (
        <span className="eyebrow text-moss shrink-0 mt-0.5">match</span>
      )}
    </li>
  );
}

function renderHighlighted(text: string, keyword: string) {
  if (!keyword) return text;
  const parts: Array<string | { hl: string }> = [];
  const lower = text.toLowerCase();
  const needle = keyword.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push({ hl: text.slice(idx, idx + needle.length) });
    cursor = idx + needle.length;
  }
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className="bg-clay/20 text-ink px-0.5">
            {p.hl}
          </span>
        ),
      )}
    </>
  );
}

function extractKeyword(trigger: TriggerPattern): string | null {
  const m = trigger.payload_match ?? {};
  for (const v of Object.values(m)) {
    if (typeof v === "string") {
      return v.startsWith("~") ? v.slice(1) : v;
    }
  }
  return null;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso.slice(11, 19);
  }
}
