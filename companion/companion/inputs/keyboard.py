from __future__ import annotations

import asyncio
import logging
import threading
import time
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
        except ImportError:
            logger.warning(
                "pynput not installed; KeyboardInputAdapter disabled. pip install pynput"
            )
            return

        def on_press(key: object) -> bool | None:
            # Bullet-proof: ANY exception inside this callback would otherwise
            # propagate up through pynput's listener thread and silently kill
            # the tap, which is exactly the bug we're hunting (one stray key
            # breaks every subsequent press). Catch everything, log, drop.
            try:
                if self._stop_event.is_set():
                    return False  # stops the listener
                raw = repr(key)
                key_str = self._normalise_key(key)
                logger.debug("key press: raw=%s normalised=%r", raw, key_str)
                event = InputEvent(
                    type="key",
                    payload={"key": key_str, "action": "press"},
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
                loop = self._loop
                queue = self._queue
                if loop is None or queue is None:
                    return None
                if loop.is_closed():
                    return None
                asyncio.run_coroutine_threadsafe(queue.put(event), loop)
                return None
            except Exception as exc:  # noqa: BLE001 — listener must never die
                logger.warning("keyboard on_press swallowed error: %s", exc)
                return None

        # Supervisor loop: even if pynput's tap dies for any reason
        # (transient OS hiccup, weird key object, etc.), relaunch the
        # listener so the user doesn't have to restart the companion.
        # The _stop_event check at the top of each iteration still gives
        # us a clean shutdown path.
        while not self._stop_event.is_set():
            try:
                with keyboard.Listener(on_press=on_press) as listener:
                    listener.join()
            except Exception as exc:  # noqa: BLE001
                logger.error("keyboard listener died: %s; restarting in 1s", exc)
                time.sleep(1.0)
            else:
                # Listener returned cleanly. If we weren't asked to stop,
                # restart it after a short pause to avoid a hot loop.
                if not self._stop_event.is_set():
                    logger.info("keyboard listener exited unexpectedly; restarting")
                    time.sleep(0.25)

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
