import logging

from companion.adapters.base import RobotAdapter
from companion.adapters.mock import MockAdapter
from companion.models import Manifest
from companion.settings import Settings

logger = logging.getLogger(__name__)


def get_adapter(settings: Settings, manifest: Manifest) -> RobotAdapter:
    """
    Factory: returns the configured adapter.
    Falls back to MockAdapter with a warning if the real adapter fails to
    initialise (e.g. hardware not connected during development).
    """
    if settings.ADAPTER == "adeept":
        try:
            from companion.adapters.adeept import AdeeptAdapter
            return AdeeptAdapter(
                manifest_id=manifest.manifest_id,
                settings=settings,
            )
        except Exception as exc:
            logger.warning(
                f"AdeeptAdapter failed to initialise ({exc}); "
                "falling back to MockAdapter."
            )
    return MockAdapter(
        manifest_id=manifest.manifest_id,
        step_delay_ms=settings.EXECUTION_STEP_DELAY_MS,
    )
