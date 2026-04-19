import type { Skill, SkillCall, SkillParameterSchema, TriggerPattern } from "../types";

export const JOINT_NAMES = [
  "Base yaw",
  "Shoulder",
  "Elbow",
  "Wrist",
  "Gripper",
] as const;

export function jointLabel(index: number): string {
  return JOINT_NAMES[index] ?? `Joint ${index}`;
}

/** A friendly, single-line summary of a SkillCall. */
export function describeCall(call: SkillCall, skill?: Skill): string {
  const args = call.arguments ?? {};
  switch (call.skill_id) {
    case "go_home":
      return "Return to home pose";
    case "set_joint_angle": {
      const j = Number(args.joint_index ?? 0);
      const a = Number(args.angle_deg ?? 0);
      return `Move ${jointLabel(j).toLowerCase()} to ${a.toFixed(0)}°`;
    }
    case "pan_left":
    case "pan_right":
    case "tilt_up":
    case "tilt_down": {
      const deg = args.degrees ?? args.deg ?? "";
      const verb = call.skill_id.replace("_", " ");
      return deg ? `${verb} ${deg}°` : verb;
    }
    case "grip_open":
      return "Open gripper";
    case "grip_close": {
      const f = args.force ?? args.strength;
      return f != null ? `Close gripper (${f})` : "Close gripper";
    }
    case "wave": {
      const cycles = args.cycles ?? args.repeats ?? 2;
      return `Wave (${cycles}×)`;
    }
    case "oled_text":
      return `Show "${String(args.text ?? "")}" on OLED`;
    default: {
      if (skill?.display_name) return skill.display_name;
      return call.skill_id;
    }
  }
}

export function findSkill(manifest: { skills: Skill[] } | null, id: string) {
  return manifest?.skills.find((s) => s.id === id);
}

/** Plain-English summary of a TriggerPattern for the UI. */
export function describeTrigger(trigger: TriggerPattern): string {
  const m = trigger.payload_match ?? {};
  switch (trigger.type) {
    case "speech": {
      const raw = String(m.normalized ?? m.text ?? "");
      const keyword = raw.startsWith("~") ? raw.slice(1) : raw;
      if (!keyword) return "any speech";
      return raw.startsWith("~")
        ? `you say something containing "${keyword}"`
        : `you say "${keyword}"`;
    }
    case "clap": {
      const count = Number(m.count ?? 1);
      if (count === 2) return "you clap twice";
      if (count === 3) return "you clap three times";
      return count === 1 ? "you clap" : `you clap ${count} times`;
    }
    case "key": {
      const key = String(m.key ?? "any key");
      const action = String(m.action ?? "press");
      return `you ${action} ${key}`;
    }
    case "gesture": {
      const g = String(m.gesture ?? "any gesture");
      return `you make a ${g.replace(/_/g, " ")}`;
    }
    default: {
      const pairs = Object.entries(m)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");
      return pairs ? `${trigger.type} (${pairs})` : trigger.type;
    }
  }
}

/** Generate a stable, kebab-case binding id from a trigger and user text. */
export function bindingIdFor(trigger: TriggerPattern, userText: string): string {
  const slug = userText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "binding";
  return `${trigger.type}-${slug}`;
}

/** Human-readable label for the bindings list, e.g. "When you say "hello", wave". */
export function bindingDisplayName(trigger: TriggerPattern, userText: string): string {
  const trimmed = userText.trim().replace(/\s+/g, " ");
  if (trimmed.length > 0 && trimmed.length <= 80) {
    return trimmed[0].toUpperCase() + trimmed.slice(1);
  }
  return `When ${describeTrigger(trigger)}`;
}

export type ParamKind = "joint" | "angle" | "integer" | "number" | "text" | "enum" | "unknown";

export function paramKind(
  skillId: string,
  paramName: string,
  schema: SkillParameterSchema,
): ParamKind {
  if (skillId === "set_joint_angle" && paramName === "joint_index") return "joint";
  if (paramName === "angle_deg" || paramName.startsWith("angle")) return "angle";
  if (schema.enum) return "enum";
  if (schema.type === "string") return "text";
  if (schema.type === "integer") return "integer";
  if (schema.type === "number") return "number";
  return "unknown";
}
