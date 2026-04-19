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

export interface TriggerPattern {
  type: string;
  payload_match: Record<string, unknown>;
}

export interface PlanResponse {
  reasoning: string;
  needs_clarification: boolean;
  questions: string[];
  plan: Plan | null;
  validation_errors: ValidationError[];
  model_used: string;
  // Present when the user described a trigger pattern (e.g. "when you hear
  // hello, …"). The frontend can offer "Save as binding" alongside Run.
  suggested_trigger?: TriggerPattern | null;
}

export interface InputSource {
  type: string;
  label: string;
  description: string;
  examples: string[];
  payload_hint: string;
  enabled: boolean;
  transport: "local-adapter" | "external-events";
}

export interface InputsResponse {
  sources: InputSource[];
}

export interface Binding {
  binding_id: string;
  display_name: string;
  trigger: TriggerPattern;
  plan: Plan;
}

export interface BindingConfig {
  config_id?: string | null;
  bindings: Binding[];
}

export interface RecentEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface RecentFire {
  id: string;
  binding_id: string;
  ok: boolean;
  detail: string;
  timestamp: string;
}

export interface RecentEventsResponse {
  events: RecentEvent[];
  fires: RecentFire[];
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
