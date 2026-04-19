import type { Skill, SkillCall, SkillParameterSchema } from "../types";

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
