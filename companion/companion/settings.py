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
    INPUTS_AUDIO_ENABLED: bool = False
    INPUTS_KEYBOARD_ENABLED: bool = True

    # Bindings
    BINDING_STORE_PATH: str = "bindings.json"
    DISPATCH_OVERLAP: str = "drop"  # "drop" | "queue"
