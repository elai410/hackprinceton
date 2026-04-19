"""
RecentEventStore — small in-memory ring buffer of recent InputEvents and
binding fires.

Used by the frontend to render a live transcription / activity feed so the
user can SEE what the microphone is hearing and which bindings actually fire.
This is purely a UX/debug aid — the dispatcher does not depend on it.

Thread-safe: the speech adapter pushes events from a worker thread via the
asyncio queue, the dispatcher consumes them on the event loop, and HTTP
handlers on the event loop read snapshots. A simple `threading.Lock` keeps
the deques consistent under all of those access patterns.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any

from companion.models import InputEvent

logger = logging.getLogger(__name__)


class RecentEventStore:
    def __init__(self, max_events: int = 30, max_fires: int = 30) -> None:
        self._events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self._fires: deque[dict[str, Any]] = deque(maxlen=max_fires)
        self._lock = threading.Lock()
        # Async pub/sub for SSE clients. Each subscriber owns a small queue;
        # we publish a copy of every recorded snapshot to all subscribers.
        # Subscribers register/unregister from the asyncio event loop, and
        # publish() is also called from the event loop (the dispatcher coroutine
        # owns both record_event and record_fire), so plain put_nowait is safe.
        self._subscribers: list[asyncio.Queue[dict[str, Any]]] = []

    # ----------------------------------------------------------------- writers
    def record_event(self, event: InputEvent) -> None:
        snap = {
            "id": uuid.uuid4().hex,
            "type": event.type,
            "timestamp": event.timestamp,
            "payload": dict(event.payload or {}),
        }
        with self._lock:
            self._events.append(snap)
        self._publish({"kind": "event", **snap})

    def record_fire(self, binding_id: str, ok: bool, detail: str = "") -> None:
        snap = {
            "id": uuid.uuid4().hex,
            "binding_id": binding_id,
            "ok": ok,
            "detail": detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._fires.append(snap)
        self._publish({"kind": "fire", **snap})

    # ----------------------------------------------------------------- readers
    def snapshot(
        self, event_limit: int = 20, fire_limit: int = 10
    ) -> dict[str, list[dict[str, Any]]]:
        """Return a defensive copy of the most recent events and fires.

        Lists are ordered oldest-first so the frontend can append-only render
        them without re-sorting.
        """
        with self._lock:
            events = list(self._events)[-event_limit:]
            fires = list(self._fires)[-fire_limit:]
        return {"events": events, "fires": fires}

    # ----------------------------------------------------------------- pub/sub
    def subscribe(self) -> "asyncio.Queue[dict[str, Any]]":
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: "asyncio.Queue[dict[str, Any]]") -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def _publish(self, message: dict[str, Any]) -> None:
        # Iterate a copy so a slow subscriber being removed mid-publish
        # doesn't blow up the dispatcher.
        #
        # CRITICAL: each subscriber gets its OWN shallow copy of the message.
        # Sharing a single dict across subscribers caused a subtle bug where
        # the first SSE consumer's `msg.pop("kind", ...)` mutated the dict
        # for every other consumer, so `fire` frames got mis-tagged as
        # `event` for the live tab when stale subscribers were still in the
        # list (React StrictMode + Vite HMR routinely produce that state).
        for q in list(self._subscribers):
            try:
                q.put_nowait(dict(message))
            except asyncio.QueueFull:
                # Subscriber is wedged; drop the message rather than block
                # the dispatcher. SSE clients will see a gap, which the
                # initial snapshot they receive on reconnect repairs.
                logger.warning("RecentEventStore: subscriber queue full — dropping message")
