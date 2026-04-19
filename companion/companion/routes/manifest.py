from fastapi import APIRouter, Request

from companion.models import Manifest

router = APIRouter()


@router.get("/manifest", response_model=Manifest)
def manifest(request: Request) -> Manifest:
    """Expose the loaded robot manifest so the frontend can render block titles
    and parameter forms without duplicating the schema."""
    return request.app.state.manifest
