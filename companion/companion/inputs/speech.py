"""
SpeechInputAdapter — captures audio from any local microphone and transcribes
each detected utterance with faster-whisper, an open-source Whisper port that
runs on CPU or GPU.

The adapter loads its model on startup but does NOT open the microphone
stream until something asks it to. Call `set_listening(True)` to open the
stream and start emitting transcripts; call `set_listening(False)` to close
the stream so the OS releases the mic (the recording-indicator dot in the
status bar disappears immediately). The model stays loaded across
listen/idle transitions so re-arming is instant.

Emits InputEvent(type="speech", payload={
    "text":       "<raw transcript with original casing/punctuation>",
    "normalized": "<lowercased, trimmed, terminal punctuation stripped>",
    "language":   "en" | "es" | ...,
    "duration_s": float,
    "confidence": float | None,   # mean avg_logprob from whisper segments
    "source":     "local-mic",
})

Bindings can match speech triggers either exactly:

    {"type": "speech", "payload_match": {"normalized": "wave hello"}}

or by substring (case-insensitive) using the `~` prefix supported by the
matcher:

    {"type": "speech", "payload_match": {"text": "~hello"}}

The platform also accepts speech events from any external client via
POST /events — a phone, smartwatch, or smart-speaker bridge can transcribe
locally and post the same payload shape; the dispatcher handles them
identically to events from this adapter.

Requires:  faster-whisper, sounddevice, numpy
    pip install -e ".[inputs,speech]"

The first transcription pays a one-off model-download cost (cached under
~/.cache/huggingface/hub).  Subsequent runs are immediate.
"""
from __future__ import annotations

import asyncio
import logging
import queue as _queue
import threading
import time
from datetime import datetime, timezone
from typing import Any

from companion.models import InputEvent
from companion.settings import Settings

logger = logging.getLogger(__name__)

_SAMPLE_RATE = 16_000      # Whisper's expected rate
_BLOCK_SIZE = 480          # 30 ms blocks at 16 kHz


class SpeechInputAdapter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._queue: "asyncio.Queue[InputEvent] | None" = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop_event = threading.Event()
        # Drives the on-demand microphone stream. Cleared at startup so the
        # mic is closed by default — the user explicitly opts in via
        # set_listening(True) (typically when they hit "Start" in the UI).
        self._listen_event = threading.Event()
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------ Protocol
    def start(self, queue: "asyncio.Queue[InputEvent]") -> None:
        self._queue = queue
        self._loop = asyncio.get_event_loop()
        self._stop_event.clear()
        # Note: _listen_event is left clear on purpose. The microphone won't
        # open until the user asks for it.
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="speech-input"
        )
        self._thread.start()
        logger.info("SpeechInputAdapter started — model loads in background, mic idle")

    def stop(self) -> None:
        self._stop_event.set()
        # Make sure the inner sleep returns immediately.
        self._listen_event.set()

    def input_type(self) -> str:
        return "speech"

    # ------------------------------------------------------------------ Control
    def set_listening(self, active: bool) -> None:
        """Open or close the microphone stream on demand. Cheap to toggle."""
        if active:
            if not self._listen_event.is_set():
                logger.info("SpeechInputAdapter: listening = ON")
            self._listen_event.set()
        else:
            if self._listen_event.is_set():
                logger.info("SpeechInputAdapter: listening = OFF")
            self._listen_event.clear()

    def is_listening(self) -> bool:
        return self._listen_event.is_set() and not self._stop_event.is_set()

    # ------------------------------------------------------------------ Internals
    def _run(self) -> None:
        try:
            import sounddevice as sd
            import numpy as np
            from faster_whisper import WhisperModel
        except ImportError as exc:
            logger.warning(
                "SpeechInputAdapter disabled — missing dependency: %s. "
                'Install with `pip install -e ".[inputs,speech]"`.',
                exc,
            )
            return

        # Load the open-source Whisper model. int8 keeps CPU latency reasonable
        # on a laptop; switch to float16 if running on CUDA.
        model_size = self._settings.SPEECH_MODEL_SIZE
        device = self._settings.SPEECH_DEVICE
        compute_type = "int8" if device == "cpu" else "float16"
        try:
            t0 = time.time()
            logger.info(
                "SpeechInputAdapter: loading whisper '%s' on %s (%s)…",
                model_size, device, compute_type,
            )
            model = WhisperModel(model_size, device=device, compute_type=compute_type)
            logger.info(
                "SpeechInputAdapter: model ready in %.1fs — waiting for set_listening(True)",
                time.time() - t0,
            )
        except Exception as exc:
            logger.error("SpeechInputAdapter: failed to load model — %s", exc)
            return

        # ---- VAD parameters (derived from settings) -----------------------
        threshold = self._settings.SPEECH_VAD_THRESHOLD
        min_silence_blocks = max(
            1,
            int(self._settings.SPEECH_MIN_SILENCE_MS / 1000 * _SAMPLE_RATE / _BLOCK_SIZE),
        )
        min_phrase_blocks = max(
            1,
            int(self._settings.SPEECH_MIN_PHRASE_MS / 1000 * _SAMPLE_RATE / _BLOCK_SIZE),
        )
        max_phrase_blocks = int(
            self._settings.SPEECH_MAX_PHRASE_S * _SAMPLE_RATE / _BLOCK_SIZE
        )

        # ---- Worker thread for transcription (long-lived) ----------------
        # The audio callback runs in a high-priority audio thread; it must
        # never block. We hand finalized phrases off to a worker via a queue.
        work_queue: "_queue.Queue[Any | None]" = _queue.Queue(maxsize=8)

        def _worker() -> None:
            while True:
                item = work_queue.get()
                if item is None:
                    return
                try:
                    self._transcribe_and_emit(item, model, np)
                except Exception as exc:
                    logger.exception("SpeechInputAdapter transcription failed: %s", exc)

        worker = threading.Thread(
            target=_worker, daemon=True, name="speech-stt-worker"
        )
        worker.start()

        # ---- Capture loop (gated by _listen_event) -----------------------
        try:
            while not self._stop_event.is_set():
                # Wait, with periodic wake-ups so we can notice _stop_event.
                if not self._listen_event.wait(timeout=0.25):
                    continue
                if self._stop_event.is_set():
                    break

                # Fresh per-session capture state.
                state: dict[str, Any] = {
                    "recording": False,
                    "silent_blocks": 0,
                    "block_count": 0,
                    "buffer": [],
                }

                def callback(
                    indata: "np.ndarray", frames: int, time_info: object, status: object,
                ) -> None:
                    # If we've been asked to stop or to pause listening, just
                    # discard incoming audio — the outer loop will close the
                    # InputStream in <=50 ms.
                    if self._stop_event.is_set() or not self._listen_event.is_set():
                        return
                    mono = indata[:, 0] if indata.ndim > 1 else indata.flatten()
                    rms = float(np.sqrt(np.mean(mono * mono) + 1e-12))
                    is_loud = rms > threshold

                    if state["recording"]:
                        state["buffer"].append(mono.copy())
                        state["block_count"] += 1
                        if is_loud:
                            state["silent_blocks"] = 0
                        else:
                            state["silent_blocks"] += 1

                        phrase_long_enough = state["block_count"] >= min_phrase_blocks
                        trailing_silence_long = state["silent_blocks"] >= min_silence_blocks
                        hit_max = state["block_count"] >= max_phrase_blocks

                        if (phrase_long_enough and trailing_silence_long) or hit_max:
                            audio = np.concatenate(state["buffer"]).astype("float32")
                            try:
                                work_queue.put_nowait(audio)
                            except _queue.Full:
                                logger.warning(
                                    "SpeechInputAdapter: STT worker is behind — "
                                    "dropping a phrase",
                                )
                            state["buffer"] = []
                            state["recording"] = False
                            state["silent_blocks"] = 0
                            state["block_count"] = 0
                    else:
                        if is_loud:
                            state["recording"] = True
                            state["buffer"] = [mono.copy()]
                            state["silent_blocks"] = 0
                            state["block_count"] = 1

                try:
                    logger.info("SpeechInputAdapter: opening microphone stream")
                    with sd.InputStream(
                        samplerate=_SAMPLE_RATE,
                        channels=1,
                        dtype="float32",
                        blocksize=_BLOCK_SIZE,
                        callback=callback,
                    ):
                        # Block here while we're supposed to be listening.
                        # 50 ms granularity is more than fast enough for
                        # responsive Stop without burning CPU.
                        while (
                            not self._stop_event.is_set()
                            and self._listen_event.is_set()
                        ):
                            time.sleep(0.05)
                    logger.info("SpeechInputAdapter: closed microphone stream")
                except Exception as exc:
                    logger.error("SpeechInputAdapter audio stream error: %s", exc)
                    # Backoff before retrying to avoid a tight error loop.
                    time.sleep(0.5)
        finally:
            work_queue.put(None)
            worker.join(timeout=5)

    def _transcribe_and_emit(
        self, audio: "Any", model: "Any", np: "Any",
    ) -> None:
        # Skip very short blips (< 300 ms) — usually room noise that
        # crossed threshold for a single block.
        if audio.shape[0] < int(_SAMPLE_RATE * 0.3):
            return

        # If listening was turned off between capture and transcription,
        # discard the result — the user explicitly stopped the mic and
        # shouldn't get late transcripts trickling in.
        if not self._listen_event.is_set():
            return

        duration_s = audio.shape[0] / _SAMPLE_RATE
        language = self._settings.SPEECH_LANGUAGE or None

        # faster-whisper's transcribe() returns a generator + an info object.
        segments, info = model.transcribe(
            audio,
            language=language,
            vad_filter=False,           # we already segmented via amplitude VAD
            beam_size=1,                # greedy is fast enough for short phrases
            no_speech_threshold=0.6,
        )
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments).strip()
        if not text:
            return

        normalized = text.lower().strip().rstrip(".!?,;:")
        # avg_logprob is per-segment; rough mean is fine as a confidence proxy.
        logprobs = [
            s.avg_logprob for s in segments
            if getattr(s, "avg_logprob", None) is not None
        ]
        confidence: float | None = (
            float(np.mean(logprobs)) if logprobs else None
        )

        event = InputEvent(
            type="speech",
            payload={
                "text": text,
                "normalized": normalized,
                "language": getattr(info, "language", language or "en"),
                "duration_s": round(duration_s, 2),
                "confidence": confidence,
                "source": "local-mic",
            },
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(
            "SpeechInputAdapter: heard \u2018%s\u2019 (%.2fs, lang=%s)",
            text, duration_s, event.payload["language"],
        )
        if self._loop is not None and self._queue is not None:
            asyncio.run_coroutine_threadsafe(self._queue.put(event), self._loop)
