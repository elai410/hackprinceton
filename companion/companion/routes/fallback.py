import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from companion.models import ErrorDetail, ErrorResponse, FallbackRequest, ExecuteResponse, Plan
from companion.routes.execute import _run_plan
from companion.validate import validate_plan

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/execute/fallback", response_model=ExecuteResponse)
def execute_fallback(body: FallbackRequest, request: Request) -> ExecuteResponse:
    if not body.use_fallback_file:
        raise HTTPException(status_code=400, detail="use_fallback_file must be true")

    state = request.app.state
    path = Path(state.settings.FALLBACK_PLAN_PATH)

    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Fallback plan file not found: {state.settings.FALLBACK_PLAN_PATH}",
        )

    try:
        plan = Plan.model_validate(json.loads(path.read_text()))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load fallback plan: {exc}",
        )

    errors = validate_plan(state.manifest, plan)
    if errors:
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message="Fallback plan file is invalid",
                    details={"validation_errors": [e.model_dump() for e in errors]},
                )
            ).model_dump(),
        )

    logger.warning("Executing fallback plan from file")
    return _run_plan(plan, state.adapter, state.manifest)
