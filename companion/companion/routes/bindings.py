from fastapi import APIRouter, HTTPException, Request

from companion.models import (
    Binding,
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


@router.post("/bindings/add", response_model=BindingConfig, status_code=201)
def add_binding(body: Binding, request: Request) -> BindingConfig:
    """
    Append a single binding to the active set without disturbing existing
    bindings. Used by the frontend "Activate trigger" flow: the user already
    has an authored plan + a planner-suggested TriggerPattern, so we just
    need to wire them together and hot-reload the dispatcher.

    If a binding with the same binding_id already exists, it is replaced
    in-place (so re-activating the same trigger updates rather than
    duplicates it).
    """
    state = request.app.state

    plan_errors = validate_plan(state.manifest, body.plan)
    if plan_errors:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message="Binding plan failed validation",
                    details={"validation_errors": [e.model_dump() for e in plan_errors]},
                )
            ).model_dump(),
        )

    current = state.binding_store.get()
    next_bindings = [b for b in current.bindings if b.binding_id != body.binding_id]
    next_bindings.append(body)
    new_config = BindingConfig(config_id=current.config_id, bindings=next_bindings)
    state.binding_store.set(new_config)
    return new_config


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
