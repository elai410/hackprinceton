// TypeScript mirrors of companion/companion/models.py
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface SkillParameterSchema {
  type?: "string" | "integer" | "number" | "boolean";
  minimum?: number;
  maximum?: number;
  enum?: Array<string | number>;
  maxLength?: number;
  default?: unknown;
}

export interface Skill {
  id: string;
  display_name: string;
  description: string;
  parameters: Record<string, SkillParameterSchema>;
  constraints: Record<string, unknown>;
}

export interface Manifest {
  manifest_id: string;
  robot_label: string;
  skills: Skill[];
}

export interface SkillCall {
  skill_id: string;
  arguments: Record<string, unknown>;
}

export interface Plan {
  plan_id?: string;
  steps: SkillCall[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface PlanRequest {
  session_id?: string;
  user_text: string;
  clarification_replies: string[];
}

export interface PlanResponse {
  reasoning: string;
  needs_clarification: boolean;
  questions: string[];
  plan: Plan | null;
  validation_errors: ValidationError[];
  model_used: string;
}

export interface ExecuteRequest {
  plan: Plan;
  dry_run: boolean;
}

export interface StepResult {
  index: number;
  skill_id: string;
  arguments: Record<string, unknown>;
  status: StepStatus;
  detail: string;
  started_at: string;
  ended_at: string;
}

export interface ExecuteTrace {
  plan_id: string | null;
  steps: StepResult[];
}

export interface ExecuteResponse {
  ok: boolean;
  trace: ExecuteTrace;
}

export interface HealthResponse {
  status: string;
  manifest_id: string;
  adapter: string;
}
