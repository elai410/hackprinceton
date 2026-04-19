import asyncio

from companion.inputs.base import InputAdapter
from companion.settings import Settings


def get_input_adapters(settings: Settings) -> list[InputAdapter]:
    """
    Return enabled input adapters based on settings flags.
    Imports are deferred so missing optional dependencies only affect
    the adapter that needs them.
    """
    adapters: list[InputAdapter] = []

    if settings.INPUTS_KEYBOARD_ENABLED:
        from companion.inputs.keyboard import KeyboardInputAdapter
        adapters.append(KeyboardInputAdapter())

    if settings.INPUTS_AUDIO_ENABLED:
        from companion.inputs.audio import AudioInputAdapter
        adapters.append(AudioInputAdapter())

    if settings.INPUTS_SPEECH_ENABLED:
        from companion.inputs.speech import SpeechInputAdapter
        adapters.append(SpeechInputAdapter(settings))

    if settings.INPUTS_CAMERA_ENABLED:
        from companion.inputs.camera import CameraInputAdapter
        adapters.append(CameraInputAdapter())

    return adapters
