from fastapi import APIRouter, Request

from companion.models import PlanRequest, PlanResponse
from companion.planner.service import plan_from_nl

router = APIRouter()


@router.post("/plan", response_model=PlanResponse)
async def plan(body: PlanRequest, request: Request) -> PlanResponse:
    state = request.app.state
    return await plan_from_nl(body, state.manifest, state.settings)
