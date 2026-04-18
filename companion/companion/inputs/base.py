import asyncio
from typing import Protocol, runtime_checkable

from companion.models import InputEvent


@runtime_checkable
class InputAdapter(Protocol):
    def start(self, queue: "asyncio.Queue[InputEvent]") -> None:
        """
        Spawn a background thread and begin pushing InputEvents to queue.
        Must be non-blocking: returns immediately after starting the thread.
        """
        ...

    def stop(self) -> None:
        """Signal the background thread to exit cleanly. Idempotent."""
        ...

    def input_type(self) -> str:
        """Return the source type: 'camera' | 'audio' | 'keyboard'."""
        ...
