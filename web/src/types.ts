// TypeScript mirrors of companion/companion/models.py
// Owned by WS-D; WS-A reviews field-name parity.
// No logic here — types only.

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

// ---------------------------------------------------------------------------
// Robot manifest
// ---------------------------------------------------------------------------

export interface Skill {
  id: string;
  display_name: string;
  description: string;
  parameters: Record<string, unknown>;
  constraints: Record<string, unknown>;
}

export interface Manifest {
  manifest_id: string;
  robot_label: string;
  skills: Skill[];
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Planner request / response
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Execute request / response
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Health / error
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  manifest_id: string;
  adapter: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input events
// ---------------------------------------------------------------------------

export interface InputEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

export interface TriggerPattern {
  type: string;
  payload_match: Record<string, unknown>;
}

export interface Binding {
  binding_id: string;
  display_name: string;
  trigger: TriggerPattern;
  plan: Plan;
}

export interface BindingConfig {
  config_id?: string;
  bindings: Binding[];
}

export interface BindingConfigureRequest {
  user_text: string;
  session_id?: string;
}

export interface BindingConfigureResponse {
  bindings: Binding[];
  reasoning: string;
  validation_errors: ValidationError[];
}
