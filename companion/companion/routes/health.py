from fastapi import APIRouter, Request

from companion.models import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    adapter_info = request.app.state.adapter.health()
    return HealthResponse(
        status="ok",
        manifest_id=request.app.state.manifest.manifest_id,
        adapter=adapter_info.get("adapter", "unknown"),
    )
