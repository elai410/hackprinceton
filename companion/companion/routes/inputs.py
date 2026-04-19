"""GET /inputs — what input sources can fire bindings on this companion.

Lets the frontend render the live trigger menu and stops it from offering
trigger types the planner would refuse to wire (e.g. speech when the speech
adapter is disabled).

Mirrors `companion.inputs.registry.all_input_sources(settings)` exactly.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from companion.inputs.registry import all_input_sources

router = APIRouter()


@router.get("/inputs")
def list_inputs(request: Request) -> dict[str, Any]:
    settings = request.app.state.settings
    sources = all_input_sources(settings)
    return {
        "sources": [
            {
                "type": s.type,
                "label": s.label,
                "description": s.description,
                "examples": list(s.examples),
                "payload_hint": s.payload_hint,
                "enabled": s.enabled,
                "transport": s.transport,
            }
            for s in sources
        ],
    }


class _ListenBody(BaseModel):
    listening: bool


@router.post("/inputs/speech")
def set_speech_listening(body: _ListenBody, request: Request) -> dict[str, Any]:
    """Open or close the local microphone on demand.

    The speech adapter loads its model on startup but keeps the mic CLOSED
    until something asks for it (typically the frontend "Start" button when
    arming a speech trigger). That way the OS recording-indicator only lights
    up while the user has explicitly asked to listen.
    """
    adapters = getattr(request.app.state, "input_adapters", []) or []
    for ad in adapters:
        if getattr(ad, "input_type", lambda: "")() == "speech":
            setter = getattr(ad, "set_listening", None)
            if not callable(setter):
                raise HTTPException(
                    status_code=409,
                    detail="speech adapter does not support on-demand listening",
                )
            setter(body.listening)
            is_listening = getattr(ad, "is_listening", lambda: body.listening)()
            return {"listening": bool(is_listening)}
    raise HTTPException(
        status_code=404,
        detail="speech adapter is not enabled on this companion",
    )
