"""
BindingStore — thread-safe in-memory binding config with optional JSON file persistence.
Owned by WS-A: pure state management, no hardware dependency.
"""

import json
import threading
from pathlib import Path
from typing import Optional

from companion.models import BindingConfig


class BindingStore:
    def __init__(self, persist_path: Optional[str] = None) -> None:
        self._config = BindingConfig()
        self._lock = threading.Lock()
        self._persist_path = Path(persist_path) if persist_path else None

    def get(self) -> BindingConfig:
        """Return current config (deep copy so callers cannot mutate internal state)."""
        with self._lock:
            return self._config.model_copy(deep=True)

    def set(self, config: BindingConfig) -> None:
        """
        Hot-reload: atomically replace the entire config.
        Persists to disk after updating memory so a crash between the two
        leaves the old file intact.
        """
        with self._lock:
            self._config = config
            if self._persist_path is not None:
                self._persist_path.write_text(config.model_dump_json(indent=2))

    def load_from_file(self, path: str) -> None:
        """Load config from a JSON file on startup. Noop if file does not exist."""
        p = Path(path)
        if not p.exists():
            return
        try:
            data = json.loads(p.read_text())
            self.set(BindingConfig.model_validate(data))
        except Exception as exc:
            # Log but don't crash — companion still starts without saved bindings
            import logging
            logging.getLogger(__name__).warning(
                f"Failed to load binding store from {path}: {exc}"
            )
