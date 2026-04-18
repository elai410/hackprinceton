from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone

from companion.models import InputEvent

logger = logging.getLogger(__name__)

# Map pynput special key names to our canonical names
_SPECIAL_KEY_MAP: dict[str, str] = {
    "Key.space": "space",
    "Key.enter": "enter",
    "Key.esc": "escape",
    "Key.backspace": "backspace",
    "Key.tab": "tab",
    "Key.up": "up",
    "Key.down": "down",
    "Key.left": "left",
    "Key.right": "right",
    **{f"Key.f{i}": f"f{i}" for i in range(1, 13)},
}


class KeyboardInputAdapter:
    """
    Listens for key presses using pynput and pushes InputEvents to the shared queue.
    Requires pynput: pip install pynput
    """

    def __init__(self) -> None:
        self._queue: "asyncio.Queue[InputEvent] | None" = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, queue: "asyncio.Queue[InputEvent]") -> None:
        self._queue = queue
        self._loop = asyncio.get_event_loop()
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="keyboard-input")
        self._thread.start()
        logger.info("KeyboardInputAdapter started")

    def stop(self) -> None:
        self._stop_event.set()

    def input_type(self) -> str:
        return "keyboard"

    def _run(self) -> None:
        try:
            from pynput import keyboard

            def on_press(key: object) -> bool | None:
                if self._stop_event.is_set():
                    return False  # stops the listener
                key_str = self._normalise_key(key)
                event = InputEvent(
                    type="key",
                    payload={"key": key_str, "action": "press"},
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
                if self._loop is not None and self._queue is not None:
                    asyncio.run_coroutine_threadsafe(
                        self._queue.put(event), self._loop
                    )
                return None

            with keyboard.Listener(on_press=on_press) as listener:
                listener.join()

        except ImportError:
            logger.warning("pynput not installed; KeyboardInputAdapter disabled. pip install pynput")
        except Exception as exc:
            logger.error(f"KeyboardInputAdapter error: {exc}")

    @staticmethod
    def _normalise_key(key: object) -> str:
        """Convert a pynput Key object or char to our canonical key string."""
        raw = str(key)
        if raw in _SPECIAL_KEY_MAP:
            return _SPECIAL_KEY_MAP[raw]
        # Single printable character: pynput wraps it in quotes e.g. "'a'"
        if raw.startswith("'") and raw.endswith("'") and len(raw) == 3:
            return raw[1]
        return raw
