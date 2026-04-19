import { useStore } from "../../state/store";
import type { TriggerActivity } from "../../state/store";

/**
 * Scrollable, capped log of trigger lifecycle events (armed / fired /
 * disarmed). Kept out of the main chat stream so the conversation pane
 * stays tidy when a single binding fires many times.
 *
 * Renders nothing when the buffer is empty so the workflow column doesn't
 * gain visual weight before the first arm.
 */
export default function TriggerActivity() {
  const entries = useStore((s) => s.triggerActivity);

  if (entries.length === 0) return null;

  // Newest first — repeated fires read top-down without the user having
  // to scroll to the end of the list.
  const ordered = [...entries].reverse();

  return (
    <section className="mx-8 mb-3" aria-label="Trigger activity">
      <div className="hairline-soft bg-paper">
        <div className="px-4 py-2 flex items-center justify-between border-b border-hair">
          <span className="eyebrow text-graphite">Trigger activity</span>
          <span className="font-mono text-[10px] text-mute">
            {entries.length} event{entries.length === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="max-h-44 overflow-y-auto divide-y divide-hair">
          {ordered.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ActivityRow({ entry }: { entry: TriggerActivity }) {
  const dot = dotClass(entry.kind);
  return (
    <li className="px-4 py-2 flex items-start gap-3 text-[13px] leading-snug">
      <span
        className={`relative inline-block w-2 h-2 mt-[6px] shrink-0 ${dot}`}
        aria-hidden
      />
      <span className="flex-1 break-words text-graphite">{entry.text}</span>
      <span className="font-mono text-[10px] text-mute shrink-0 mt-[3px]">
        {formatTime(entry.timestamp)}
      </span>
    </li>
  );
}

function dotClass(kind: TriggerActivity["kind"]): string {
  switch (kind) {
    case "fired":
      return "bg-moss";
    case "fired_failed":
      return "bg-clay";
    case "armed":
    case "disarmed":
    default:
      return "bg-sage";
  }
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}
