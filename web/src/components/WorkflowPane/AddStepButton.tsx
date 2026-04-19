import { useState } from "react";
import type { Manifest, SkillParameterSchema } from "../../types";
import { useStore } from "../../state/store";

interface Props {
  manifest: Manifest | null;
  disabled?: boolean;
}

export default function AddStepButton({ manifest, disabled }: Props) {
  const addStep = useStore((s) => s.addStep);
  const [open, setOpen] = useState(false);

  if (!manifest) {
    return (
      <button type="button" disabled className="btn-ghost w-full">
        + Add step (manifest unavailable)
      </button>
    );
  }

  function pick(skillId: string) {
    const skill = manifest!.skills.find((s) => s.id === skillId);
    if (!skill) return;
    const args: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(skill.parameters)) {
      args[name] = defaultFor(schema);
    }
    addStep({ skill_id: skillId, arguments: args });
    setOpen(false);
  }

  return (
    <div className="hairline-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="w-full px-4 py-3 text-left text-sm text-graphite hover:bg-paper hover:text-ink transition-colors flex items-center justify-between"
      >
        <span className="eyebrow">Add a step</span>
        <span className="font-mono text-xs">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="border-t border-hair divide-y divide-hair animate-fadeUp max-h-72 overflow-y-auto">
          {manifest.skills.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pick(s.id)}
                className="w-full text-left px-4 py-3 hover:bg-cream transition-colors"
              >
                <p className="font-display text-[17px] text-ink leading-tight">{s.display_name}</p>
                <p className="text-[12px] text-mute mt-0.5 line-clamp-1">{s.description}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function defaultFor(schema: SkillParameterSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "string") return "";
  if (schema.type === "integer" || schema.type === "number") {
    return schema.minimum ?? 0;
  }
  if (schema.type === "boolean") return false;
  if (schema.enum && schema.enum.length) return schema.enum[0];
  return null;
}
