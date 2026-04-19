"""
Single source of truth for "what input sources can fire bindings on this
companion right now".

Used to:
 - Inject the live list into both planner prompts (one-shot plan + bindings
   configure) so K2 / Claude know which trigger types are real.
 - Power /inputs (frontend reads this to show users what's plugged in).

Every InputAdapter implemented in companion/inputs/* has a matching entry in
the static catalog below. Whether it actually shows up in
`available_input_sources(settings)` is decided by the corresponding
INPUTS_*_ENABLED flag, so the planner's view of the world always matches the
running adapters.

Any device in the world can also POST events to /events, so a SECOND list of
"external" sources (today: just /events itself) is always returned.
"""
from __future__ import annotations

from dataclasses import dataclass

from companion.settings import Settings


@dataclass(frozen=True)
class InputSource:
    type: str            # InputEvent.type the adapter emits
    label: str           # human-readable name
    description: str     # what it does and where it physically lives
    examples: list[str]  # natural-language phrasings the user might use
    payload_hint: str    # one-liner showing how to write trigger.payload_match
    enabled: bool = True
    transport: str = "local-adapter"  # "local-adapter" | "external-events"


# ---------------------------------------------------------------------------
# Catalog — every adapter implemented in companion/inputs/*
# ---------------------------------------------------------------------------

_LOCAL_ADAPTERS: list[InputSource] = [
    InputSource(
        type="speech",
        label="Microphone (open-source Whisper STT)",
        description=(
            "Spoken phrases captured by the companion's default audio input "
            "device and transcribed locally with faster-whisper. The "
            "microphone does NOT need to be on the robot — the companion "
            "machine (laptop / Pi / NUC) listens on its behalf. External "
            "devices (phone, watch, smart-speaker bridge) can post the same "
            "speech payload shape to /events."
        ),
        examples=[
            'when you hear "hello", wave',
            'when I say "goodnight", lower the arm and show goodnight',
            'every time someone says my name, do X',
        ],
        payload_hint=(
            'For trigger keywords, use {"normalized": "~<keyword>"} — the '
            "leading `~` enables case-insensitive substring matching against "
            "the lowercased transcript. Use exact match only when the user "
            "wants the WHOLE spoken phrase to equal a fixed string."
        ),
    ),
    InputSource(
        type="clap",
        label="Clap detector (microphone amplitude)",
        description=(
            "Amplitude-threshold clap detector running on the companion's "
            "microphone. Counts consecutive claps that fall inside a 0.5 "
            "second window."
        ),
        examples=[
            "when I clap twice, return to home",
            "double clap to wave",
        ],
        payload_hint='{"count": <int>}  e.g. {"count": 2} for a double clap',
    ),
    InputSource(
        type="key",
        label="Keyboard (companion machine or browser)",
        description=(
            "Physical key presses on the companion machine via pynput, or "
            "key events injected from the web client via POST /events."
        ),
        examples=[
            "when I press space, go home",
            "press H to wave hello",
            "press the right arrow to pan the base right",
        ],
        payload_hint=(
            '{"key": "<a-z|0-9|space|enter|escape|backspace|tab|up|down|'
            'left|right|f1..f12>", "action": "press"}'
        ),
    ),
    InputSource(
        type="gesture",
        label="Camera gestures (MediaPipe hand-tracking)",
        description=(
            "Hand gestures detected via webcam using MediaPipe. Fixed "
            "vocabulary — never invent gesture names not listed in payload_hint."
        ),
        examples=[
            "when you see a thumbs up, wave",
            "when I make a fist, close the gripper",
            "open hand = open the gripper",
        ],
        payload_hint=(
            '{"gesture": "<wave_left|wave_right|fist|open_hand|thumbs_up|'
            'point_up>", "hand": "<left|right>"}  (hand is optional)'
        ),
    ),
]


# Always-on transports that don't depend on a local adapter being installed.
_EXTERNAL_SOURCES: list[InputSource] = [
    InputSource(
        type="*",
        label="External devices via POST /events",
        description=(
            "Any device on the network (phone, smartwatch, smart-speaker "
            "bridge, hardware button, separate Raspberry Pi) can act as an "
            "input source by POSTing an InputEvent to /events. The dispatcher "
            "treats those events identically to ones from local adapters. Use "
            "this when the user describes a trigger source we don't host "
            "locally but they could plausibly script themselves."
        ),
        examples=[
            "when my watch detects me running, do X",
            "when the doorbell button is pressed, wave",
        ],
        payload_hint=(
            "Any payload is allowed — match using exact keys or the `~` "
            "substring operator on string values."
        ),
        transport="external-events",
    ),
]


def _local_enabled(settings: Settings) -> set[str]:
    enabled: set[str] = set()
    if settings.INPUTS_KEYBOARD_ENABLED:
        enabled.add("key")
    if settings.INPUTS_AUDIO_ENABLED:
        enabled.add("clap")
    if settings.INPUTS_SPEECH_ENABLED:
        enabled.add("speech")
    if settings.INPUTS_CAMERA_ENABLED:
        enabled.add("gesture")
    return enabled


def available_input_sources(settings: Settings) -> list[InputSource]:
    """All input sources the planner should consider real right now.

    Ordering: enabled local adapters first (since those are most likely to
    be used by the demo), then the always-on external-events transport.
    """
    enabled = _local_enabled(settings)
    locals_ = [
        # Mark enabled flag explicitly so consumers can render disabled rows
        # if they want.
        InputSource(**{**s.__dict__, "enabled": s.type in enabled})
        for s in _LOCAL_ADAPTERS
    ]
    enabled_locals = [s for s in locals_ if s.enabled]
    return enabled_locals + _EXTERNAL_SOURCES


def all_input_sources(settings: Settings) -> list[InputSource]:
    """Every adapter the platform implements, with an `enabled` flag.

    Used by /inputs so the frontend can show 'available but off' adapters
    that the user could enable.
    """
    enabled = _local_enabled(settings)
    locals_ = [
        InputSource(**{**s.__dict__, "enabled": s.type in enabled})
        for s in _LOCAL_ADAPTERS
    ]
    return locals_ + _EXTERNAL_SOURCES


def render_for_prompt(sources: list[InputSource]) -> str:
    """Multi-line description suitable for injection into an LLM system prompt."""
    if not sources:
        return (
            "No live input sources are currently enabled on this companion. "
            "External devices may still POST events to /events, but no local "
            "adapter is listening. Treat trigger requests as unsupported and "
            "ask the user to enable an input source."
        )
    lines: list[str] = []
    for s in sources:
        examples = "; ".join(f'"{e}"' for e in s.examples)
        lines.append(
            f"- type=\"{s.type}\" — {s.label}\n"
            f"  {s.description}\n"
            f"  Example user phrasings that imply this trigger: {examples}\n"
            f"  Trigger pattern: {s.payload_hint}"
        )
    return "\n".join(lines)
