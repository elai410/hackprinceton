import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

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


@router.get("/events/recent")
def recent_events(request: Request, events: int = 20, fires: int = 10) -> dict:
    """Snapshot endpoint. Useful for clients that can't speak SSE, or as a
    cheap sanity check from curl. Live clients should prefer /events/stream."""
    store = request.app.state.recent_events
    events = max(0, min(events, 100))
    fires = max(0, min(fires, 100))
    return store.snapshot(event_limit=events, fire_limit=fires)


@router.get("/events/stream")
async def events_stream(request: Request) -> StreamingResponse:
    """Server-Sent Events feed of the live event/fire stream.

    Frame schema:
      event: snapshot   data: {"events":[...], "fires":[...]}   (sent once on connect)
      event: event      data: {<RecentEvent>}                    (live)
      event: fire       data: {<RecentFire>}                     (live)
      :ping             (15s heartbeat to keep proxies happy)

    EventSource clients reconnect automatically on disconnect; the snapshot
    sent on every reconnect repairs any gap.
    """
    store = request.app.state.recent_events

    async def gen() -> AsyncGenerator[str, None]:
        snapshot = store.snapshot(event_limit=20, fire_limit=10)
        yield _sse_frame("snapshot", snapshot)

        queue = store.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # 1.0 s keeps us responsive to client disconnects so
                    # stale subscribers (StrictMode double-mounts, Vite HMR
                    # leftovers) get reaped within ~1 s instead of up to 15 s.
                    # Implicit heartbeat arrives via `: ping` on each timeout.
                    msg = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                # Read `kind` non-destructively. Even though _publish now
                # gives each subscriber its own dict copy, never mutating
                # the message here keeps this route safe against future
                # callers that might re-introduce shared references.
                kind = msg.get("kind", "event")
                payload = {k: v for k, v in msg.items() if k != "kind"}
                yield _sse_frame(kind, payload)
        finally:
            store.unsubscribe(queue)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable proxy buffering
            "Connection": "keep-alive",
        },
    )


def _sse_frame(event: str, data: dict) -> str:
    # JSON.stringify with no newlines means a single data: line is enough.
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
