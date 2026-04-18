from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone

from companion.models import InputEvent

logger = logging.getLogger(__name__)

_CLAP_THRESHOLD = 0.25   # normalised amplitude 0–1
_CLAP_WINDOW_S = 0.5     # seconds within which consecutive claps are grouped
_SAMPLE_RATE = 44100
_BLOCK_SIZE = 512


class AudioInputAdapter:
    """
    Detects claps via amplitude threshold and pushes InputEvents to the queue.
    Requires sounddevice and numpy: pip install sounddevice numpy
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
        self._thread = threading.Thread(target=self._run, daemon=True, name="audio-input")
        self._thread.start()
        logger.info("AudioInputAdapter started")

    def stop(self) -> None:
        self._stop_event.set()

    def input_type(self) -> str:
        return "audio"

    def _run(self) -> None:
        try:
            import sounddevice as sd
            import numpy as np

            clap_times: list[float] = []
            # track the last amplitude to detect the leading edge of a clap
            above_threshold = False

            def callback(
                indata: "np.ndarray",
                frames: int,
                time_info: object,
                status: object,
            ) -> None:
                nonlocal above_threshold
                if self._stop_event.is_set():
                    raise sd.CallbackAbort()

                amplitude = float(np.abs(indata).max())
                if amplitude > _CLAP_THRESHOLD and not above_threshold:
                    above_threshold = True
                    now_ts = datetime.now(timezone.utc)
                    now_float = now_ts.timestamp()

                    clap_times[:] = [t for t in clap_times if now_float - t < _CLAP_WINDOW_S]
                    clap_times.append(now_float)
                    count = len(clap_times)

                    event = InputEvent(
                        type="clap",
                        payload={"count": count},
                        timestamp=now_ts.isoformat(),
                    )
                    if self._loop is not None and self._queue is not None:
                        asyncio.run_coroutine_threadsafe(
                            self._queue.put(event), self._loop
                        )
                elif amplitude <= _CLAP_THRESHOLD:
                    above_threshold = False

            with sd.InputStream(
                samplerate=_SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=_BLOCK_SIZE,
                callback=callback,
            ):
                self._stop_event.wait()

        except ImportError:
            logger.warning(
                "sounddevice/numpy not installed; AudioInputAdapter disabled. "
                "pip install sounddevice numpy"
            )
        except Exception as exc:
            logger.error(f"AudioInputAdapter error: {exc}")
