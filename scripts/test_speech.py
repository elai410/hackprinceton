"""
One-shot mic-and-Whisper smoke test.

Run from the repo root:
    python scripts/test_speech.py            # 5 second capture, base.en
    python scripts/test_speech.py 8 small.en # 8 second capture, small.en

What it does:
    1. Opens the default input device (will trigger the macOS mic-permission
       prompt the very first time — click Allow).
    2. Records a fixed window into a numpy buffer.
    3. Loads the same Whisper model the SpeechInputAdapter uses and prints the
       transcript plus timing.

This exercises the exact open-source pipeline (sounddevice + faster-whisper +
int8 CPU) the companion will use, without needing to restart anything.
"""

from __future__ import annotations

import sys
import time

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

SAMPLE_RATE = 16_000


def main() -> None:
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base.en"

    print(f"Default input device: {sd.query_devices(sd.default.device[0])['name']}")
    print(f"Loading whisper '{model_size}' (cpu, int8) ...")
    t0 = time.time()
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    print(f"Model ready in {time.time() - t0:.1f}s\n")

    print(f"==> Recording {seconds:.0f}s. Speak now (e.g. 'hello, wave three times')...")
    audio = sd.rec(
        int(seconds * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
    )
    sd.wait()
    audio = audio.flatten()

    rms = float(np.sqrt(np.mean(audio * audio) + 1e-12))
    peak = float(np.max(np.abs(audio)))
    print(f"==> Captured: rms={rms:.4f}  peak={peak:.3f}  "
          f"({audio.shape[0]} samples)")

    if peak < 0.005:
        print("\n!! Audio looks essentially silent. If macOS just prompted you")
        print("   for microphone access, click Allow and re-run. Otherwise try")
        print("   moving closer to the mic, unmuting, or selecting a different")
        print("   input device in System Settings -> Sound -> Input.")
        return

    print("==> Transcribing ...")
    t0 = time.time()
    segments, info = model.transcribe(
        audio, language="en", vad_filter=False, beam_size=1,
    )
    segments = list(segments)
    text = " ".join(s.text.strip() for s in segments).strip()
    elapsed = time.time() - t0

    print(f"==> Transcribed in {elapsed:.2f}s (lang={info.language})")
    print(f"\n    \u201C{text}\u201D\n" if text else "\n    (nothing heard)\n")

    if segments:
        avg_logprob = float(
            np.mean([s.avg_logprob for s in segments if s.avg_logprob is not None])
        )
        print(f"    confidence (avg_logprob, closer to 0 is better): {avg_logprob:.2f}")


if __name__ == "__main__":
    main()
