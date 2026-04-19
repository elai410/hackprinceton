import type { Skill, SkillCall, SkillParameterSchema } from "../../types";
import { JOINT_NAMES, paramKind } from "../../lib/friendly";
import { useStore } from "../../state/store";

interface Props {
  index: number;
  skill: Skill;
  step: SkillCall;
  disabled?: boolean;
}

export default function ParameterForm({ index, skill, step, disabled }: Props) {
  const updateStep = useStore((s) => s.updateStep);

  function setArg(name: string, value: unknown) {
    updateStep(index, { arguments: { [name]: value } });
  }

  const params = Object.entries(skill.parameters);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-graphite leading-snug max-w-xl">{skill.description}</p>
      {params.length === 0 ? (
        <p className="text-[12px] text-mute italic">No parameters.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {params.map(([name, schema]) => (
            <Field
              key={name}
              skillId={skill.id}
              name={name}
              schema={schema}
              value={step.arguments?.[name]}
              disabled={disabled}
              onChange={(v) => setArg(name, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  skillId: string;
  name: string;
  schema: SkillParameterSchema;
  value: unknown;
  disabled?: boolean;
  onChange: (v: unknown) => void;
}

function Field({ skillId, name, schema, value, disabled, onChange }: FieldProps) {
  const kind = paramKind(skillId, name, schema);
  const label = humanize(name);

  if (kind === "joint") {
    const v = Number(value ?? 0);
    return (
      <Wrap label={label}>
        <select
          className="field"
          value={v}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {JOINT_NAMES.map((n, i) => (
            <option key={i} value={i}>
              {i} · {n}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  if (kind === "angle" || (kind === "number" && schema.minimum != null && schema.maximum != null)) {
    const min = schema.minimum ?? 0;
    const max = schema.maximum ?? 180;
    const v = Number(value ?? min);
    return (
      <Wrap label={label} hint={`${min}–${max}`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={v}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            min={min}
            max={max}
            value={v}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="field w-20 text-right font-mono"
          />
        </div>
      </Wrap>
    );
  }

  if (kind === "integer") {
    return (
      <Wrap label={label}>
        <input
          type="number"
          step={1}
          min={schema.minimum}
          max={schema.maximum}
          value={Number(value ?? 0)}
          disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="field font-mono"
        />
      </Wrap>
    );
  }

  if (kind === "number") {
    return (
      <Wrap label={label}>
        <input
          type="number"
          step="any"
          min={schema.minimum}
          max={schema.maximum}
          value={Number(value ?? 0)}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="field font-mono"
        />
      </Wrap>
    );
  }

  if (kind === "enum") {
    return (
      <Wrap label={label}>
        <select
          className="field"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {(schema.enum ?? []).map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // text / unknown fallback
  return (
    <Wrap label={label} hint={schema.maxLength ? `max ${schema.maxLength}` : undefined}>
      <input
        type="text"
        maxLength={schema.maxLength}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
    </Wrap>
  );
}

function Wrap({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        {hint && <span className="text-[10px] text-mute font-mono">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function humanize(s: string): string {
  return s.replace(/_/g, " ");
}
