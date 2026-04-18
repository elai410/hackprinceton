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
    PLANNER_PRIMARY: str = "moonshot"
    MOONSHOT_API_KEY: Optional[str] = None
    MOONSHOT_BASE_URL: str = "https://api.moonshot.cn/v1"
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    PLANNER_MODEL_PRIMARY: str = "moonshot-v1-128k"
    PLANNER_MODEL_FALLBACKS: str = "gpt-4o-mini"
    PLANNER_TIMEOUT_S: int = 60

    # Mock adapter
    EXECUTION_STEP_DELAY_MS: int = 200

    # Input adapters
    INPUTS_CAMERA_ENABLED: bool = False
    INPUTS_AUDIO_ENABLED: bool = False
    INPUTS_KEYBOARD_ENABLED: bool = True

    # Bindings
    BINDING_STORE_PATH: str = "bindings.json"
    DISPATCH_OVERLAP: str = "drop"  # "drop" | "queue"
