import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Manifest, SkillCall, StepStatus } from "../../types";
import { describeCall, findSkill } from "../../lib/friendly";
import { useStore } from "../../state/store";
import ParameterForm from "./ParameterForm";

interface Props {
  id: string;
  index: number;
  step: SkillCall;
  status: StepStatus;
  detail: string;
  manifest: Manifest | null;
  disabled?: boolean;
}

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

export default function BlockCard({
  id,
  index,
  step,
  status,
  detail,
  manifest,
  disabled,
}: Props) {
  const removeStep = useStore((s) => s.removeStep);
  const [open, setOpen] = useState(false);

  const sortable = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const skill = findSkill(manifest, step.skill_id);
  const label = describeCall(step, skill);

  const stateClasses = {
    pending: "bg-paper border-rule",
    running: "bg-cream border-clay text-ink animate-pulseRing",
    completed: "bg-paper border-moss",
    failed: "bg-paper border-rust",
    skipped: "bg-paper border-hair text-mute",
  }[status];

  const accentBar = {
    pending: "bg-rule",
    running: "bg-clay",
    completed: "bg-moss",
    failed: "bg-rust",
    skipped: "bg-hair",
  }[status];

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={`group hairline relative ${stateClasses} ${
        sortable.isDragging ? "opacity-60" : ""
      } animate-fadeUp`}
    >
      <div className="flex items-stretch">
        <div className={`w-1 ${accentBar} shrink-0`} aria-hidden />
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="Drag to reorder"
          className="px-2 cursor-grab active:cursor-grabbing text-mute hover:text-ink select-none flex items-center"
          disabled={disabled}
        >
          <span className="font-mono text-[11px] leading-none">::</span>
        </button>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left px-3 py-3 flex items-center gap-4 min-w-0"
        >
          <span className="font-mono text-[11px] text-mute w-6 shrink-0">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[20px] leading-tight text-ink truncate">
              {label}
            </p>
            <p className="text-[12px] text-mute font-mono truncate mt-0.5">
              {step.skill_id}
              {Object.keys(step.arguments ?? {}).length > 0 && (
                <>
                  {" · "}
                  {Object.entries(step.arguments)
                    .map(([k, v]) => `${k}=${formatVal(v)}`)
                    .join(", ")}
                </>
              )}
            </p>
          </div>
          <StatusPill status={status} />
        </button>

        <button
          type="button"
          onClick={() => removeStep(index)}
          disabled={disabled}
          aria-label="Remove step"
          className="px-3 text-mute hover:text-rust border-l border-hair text-sm transition-colors disabled:opacity-30"
          title="Remove step"
        >
          ×
        </button>
      </div>

      {open && skill && (
        <div className="border-t border-hair px-5 py-4 bg-cream">
          <ParameterForm
            index={index}
            skill={skill}
            step={step}
            disabled={disabled || status === "running"}
          />
        </div>
      )}

      {detail && (status === "failed" || status === "completed") && (
        <div className="border-t border-hair px-5 py-2 text-[12px] font-mono text-graphite">
          <span className="eyebrow mr-2">{STATUS_LABEL[status]}</span>
          {detail}
        </div>
      )}
    </li>
  );
}

function StatusPill({ status }: { status: StepStatus }) {
  const cls = {
    pending: "text-mute",
    running: "text-clay",
    completed: "text-moss",
    failed: "text-rust",
    skipped: "text-mute",
  }[status];
  const dot = {
    pending: "bg-mute",
    running: "bg-clay animate-pulse",
    completed: "bg-moss",
    failed: "bg-rust",
    skipped: "bg-mute",
  }[status];
  return (
    <span className={`flex items-center gap-2 text-[11px] uppercase tracking-widest2 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatVal(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (typeof v === "string") return `"${v}"`;
  return JSON.stringify(v);
}
