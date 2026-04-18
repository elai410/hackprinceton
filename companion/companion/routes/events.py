from fastapi import APIRouter, Request

from companion.models import InputEvent

router = APIRouter()


@router.post("/events")
async def inject_event(body: InputEvent, request: Request) -> dict:
    """
    Accept an InputEvent from the browser (keyboard, browser-detected audio, etc.)
    and push it onto the shared queue. The BindingDispatcher treats it identically
    to events from hardware input adapters.
    """
    await request.app.state.event_queue.put(body)
    return {"queued": True}
