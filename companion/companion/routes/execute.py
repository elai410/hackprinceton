import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from companion.adapters.base import RobotAdapter
from companion.models import (
    ErrorDetail,
    ErrorResponse,
    ExecuteRequest,
    ExecuteResponse,
    ExecuteTrace,
    Manifest,
    StepResult,
)
from companion.validate import validate_plan

router = APIRouter()
logger = logging.getLogger(__name__)


def _run_plan(
    plan,
    adapter: RobotAdapter,
    manifest: Manifest,
) -> ExecuteResponse:
    """
    Shared execution logic used by both /execute and /execute/fallback.
    Assumes the plan has ALREADY been validated before this call.
    """
    results: list[StepResult] = []
    for i, step in enumerate(plan.steps):
        result = adapter.execute_skill_call(step)
        result.index = i
        results.append(result)
        if result.status == "failed":
            logger.error(f"Step {i} ({step.skill_id}) failed: {result.detail}")
            now = datetime.now(timezone.utc).isoformat()
            for j, remaining in enumerate(plan.steps[i + 1:], start=i + 1):
                results.append(StepResult(
                    index=j,
                    skill_id=remaining.skill_id,
                    arguments=remaining.arguments,
                    status="skipped",
                    detail="skipped due to prior failure",
                    started_at=now,
                    ended_at=now,
                ))
            break

    trace = ExecuteTrace(plan_id=plan.plan_id, steps=results)
    ok = all(r.status == "completed" for r in results)
    return ExecuteResponse(ok=ok, trace=trace)


@router.post("/execute", response_model=ExecuteResponse)
def execute(body: ExecuteRequest, request: Request) -> ExecuteResponse:
    state = request.app.state
    manifest: Manifest = state.manifest

    # Always validate before touching any adapter
    errors = validate_plan(manifest, body.plan)
    if errors:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message="Plan rejected",
                    details={"validation_errors": [e.model_dump() for e in errors]},
                )
            ).model_dump(),
        )

    # dry_run forces mock adapter regardless of ADAPTER env setting
    adapter = state.mock_adapter if body.dry_run else state.adapter
    return _run_plan(body.plan, adapter, manifest)
