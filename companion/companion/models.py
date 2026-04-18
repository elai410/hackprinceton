from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Robot manifest
# ---------------------------------------------------------------------------


class Skill(BaseModel):
    id: str
    display_name: str
    description: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    constraints: dict[str, Any] = Field(default_factory=dict)


class Manifest(BaseModel):
    manifest_id: str
    robot_label: str
    skills: list[Skill]


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------


class SkillCall(BaseModel):
    skill_id: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Plan(BaseModel):
    plan_id: Optional[str] = None
    steps: list[SkillCall]


class ValidationError(BaseModel):
    path: str
    message: str


# ---------------------------------------------------------------------------
# Planner request / response
# ---------------------------------------------------------------------------


class PlanRequest(BaseModel):
    session_id: Optional[str] = None
    user_text: str
    clarification_replies: list[str] = Field(default_factory=list)


class PlanResponse(BaseModel):
    reasoning: str
    needs_clarification: bool
    questions: list[str] = Field(default_factory=list)
    plan: Optional[Plan] = None
    validation_errors: list[ValidationError] = Field(default_factory=list)
    model_used: str


# ---------------------------------------------------------------------------
# Execute request / response
# ---------------------------------------------------------------------------

StepStatus = Literal["pending", "running", "completed", "failed", "skipped"]


class ExecuteRequest(BaseModel):
    plan: Plan
    dry_run: bool = False


class StepResult(BaseModel):
    index: int
    skill_id: str
    arguments: dict[str, Any]
    status: StepStatus
    detail: str
    started_at: str  # UTC ISO 8601
    ended_at: str  # UTC ISO 8601


class ExecuteTrace(BaseModel):
    plan_id: Optional[str]
    steps: list[StepResult]


class ExecuteResponse(BaseModel):
    ok: bool
    trace: ExecuteTrace


class FallbackRequest(BaseModel):
    use_fallback_file: bool = True


# ---------------------------------------------------------------------------
# Health / error
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str
    manifest_id: str
    adapter: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[dict[str, Any]] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


# ---------------------------------------------------------------------------
# Input events
# ---------------------------------------------------------------------------


class InputEvent(BaseModel):
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str  # UTC ISO 8601


# ---------------------------------------------------------------------------
# Bindings
# ---------------------------------------------------------------------------


class TriggerPattern(BaseModel):
    type: str
    payload_match: dict[str, Any] = Field(default_factory=dict)


class Binding(BaseModel):
    binding_id: str
    display_name: str
    trigger: TriggerPattern
    plan: Plan


class BindingConfig(BaseModel):
    config_id: Optional[str] = None
    bindings: list[Binding] = Field(default_factory=list)


class BindingConfigureRequest(BaseModel):
    user_text: str
    session_id: Optional[str] = None


class BindingConfigureResponse(BaseModel):
    bindings: list[Binding] = Field(default_factory=list)
    reasoning: str
    validation_errors: list[ValidationError] = Field(default_factory=list)
