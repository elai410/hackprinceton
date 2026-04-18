from fastapi import APIRouter, HTTPException, Request

from companion.models import (
    BindingConfig,
    BindingConfigureRequest,
    BindingConfigureResponse,
    ErrorDetail,
    ErrorResponse,
)
from companion.planner.service import bindings_from_nl
from companion.validate import validate_plan

router = APIRouter()


@router.get("/bindings", response_model=BindingConfig)
def get_bindings(request: Request) -> BindingConfig:
    return request.app.state.binding_store.get()


@router.post("/bindings/configure", response_model=BindingConfigureResponse)
async def configure_bindings(
    body: BindingConfigureRequest, request: Request
) -> BindingConfigureResponse:
    state = request.app.state
    response = await bindings_from_nl(body, state.manifest, state.settings)
    # Hot-reload store only if we got at least one valid binding
    if response.bindings:
        state.binding_store.set(BindingConfig(bindings=response.bindings))
    return response


@router.put("/bindings", response_model=BindingConfig)
def set_bindings(body: BindingConfig, request: Request) -> BindingConfig:
    """Manual hot-reload without K2: validate all plans, then store."""
    state = request.app.state
    all_errors = []
    for binding in body.bindings:
        errors = validate_plan(state.manifest, binding.plan)
        all_errors.extend(errors)

    if all_errors:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message="One or more binding plans failed validation",
                    details={"validation_errors": [e.model_dump() for e in all_errors]},
                )
            ).model_dump(),
        )

    state.binding_store.set(body)
    return body


@router.delete("/bindings/{binding_id}", status_code=204)
def delete_binding(binding_id: str, request: Request) -> None:
    store = request.app.state.binding_store
    config = store.get()
    new_bindings = [b for b in config.bindings if b.binding_id != binding_id]
    if len(new_bindings) == len(config.bindings):
        raise HTTPException(status_code=404, detail=f"Binding '{binding_id}' not found")
    store.set(BindingConfig(bindings=new_bindings))
