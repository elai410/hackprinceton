from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    COMPANION_HOST: str = "0.0.0.0"
    COMPANION_PORT: int = 8000

    # Adapter
    ADAPTER: str = "mock"  # "mock" | "adeept"
    MANIFEST_PATH: str = "examples/manifest.adeept.json"
    FALLBACK_PLAN_PATH: str = "examples/plan.fallback.json"

    # Planner
    PLANNER_PRIMARY: str = "k2think"
    K2_API_KEY: Optional[str] = None
    K2_BASE_URL: str = "https://api.k2think.ai/v1"
    ANTHROPIC_API_KEY: Optional[str] = None
    PLANNER_MODEL_PRIMARY: str = "MBZUAI-IFM/K2-Think-v2"
    PLANNER_MODEL_FALLBACKS: str = "claude-3-5-sonnet-latest"
    PLANNER_TIMEOUT_S: int = 60

    # Mock adapter
    EXECUTION_STEP_DELAY_MS: int = 200

    # Adeept hardware adapter (only used when ADAPTER=adeept)
    ADEEPT_PORT: Optional[str] = None
    ADEEPT_BAUD: int = 115200
    ADEEPT_INTERP_HZ: int = 50
    ADEEPT_MAX_SPEED_DEG_S: float = 60.0
    ADEEPT_OPEN_RESET_S: float = 2.0
    ADEEPT_HANDSHAKE_TIMEOUT_S: float = 8.0

    # Input adapters
    INPUTS_CAMERA_ENABLED: bool = False
    INPUTS_AUDIO_ENABLED: bool = False        # amplitude clap detector
    INPUTS_KEYBOARD_ENABLED: bool = True
    INPUTS_SPEECH_ENABLED: bool = False       # local mic + open-source Whisper

    # Speech (local STT via faster-whisper)
    # SPEECH_MODEL_SIZE: tiny.en | base.en | small.en | medium.en | large-v3
    #   tiny.en  ~75 MB  fastest, lower accuracy
    #   base.en  ~150 MB recommended default for laptop CPU
    #   small.en ~500 MB more accurate, slower on CPU
    SPEECH_MODEL_SIZE: str = "base.en"
    SPEECH_LANGUAGE: str = "en"               # ISO code; "" = auto-detect
    SPEECH_DEVICE: str = "cpu"                # cpu | cuda | auto
    SPEECH_VAD_THRESHOLD: float = 0.015       # RMS amplitude (tune per env)
    SPEECH_MIN_SILENCE_MS: int = 700          # trailing silence to end a phrase
    SPEECH_MIN_PHRASE_MS: int = 350           # ignore shorter blips
    SPEECH_MAX_PHRASE_S: float = 8.0          # hard cap per phrase

    # Bindings
    BINDING_STORE_PATH: str = "bindings.json"
    # "queue" lets a second trigger fired while the first is still executing
    # wait its turn instead of being silently dropped — much friendlier when
    # the user repeats the trigger phrase ("hello, hello"). Use "drop" if
    # you have long-running plans where stacking would be unsafe.
    DISPATCH_OVERLAP: str = "queue"  # "drop" | "queue"
