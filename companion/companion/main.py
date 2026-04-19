"""
Companion FastAPI application.
Run: uvicorn companion.main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from companion.adapters import get_adapter
from companion.adapters.mock import MockAdapter
from companion.bindings.dispatcher import BindingDispatcher
from companion.bindings.store import BindingStore
from companion.events.recent import RecentEventStore
from companion.inputs import get_input_adapters
from companion.models import InputEvent, Manifest
from companion.routes import (
    bindings,
    events,
    execute,
    fallback,
    health,
    inputs as inputs_route,
    manifest,
    plan,
)
from companion.settings import Settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = Settings()

    # Load manifest
    manifest_path = Path(settings.MANIFEST_PATH)
    if not manifest_path.exists():
        raise FileNotFoundError(
            f"Manifest not found: {settings.MANIFEST_PATH}. "
            "Check MANIFEST_PATH in .env."
        )
    manifest = Manifest.model_validate(json.loads(manifest_path.read_text()))
    logger.info(f"Loaded manifest: {manifest.manifest_id} ({len(manifest.skills)} skills)")

    # Adapters — real adapter may fall back to mock if hardware unavailable
    adapter = get_adapter(settings, manifest)
    mock_adapter = MockAdapter(
        manifest_id=manifest.manifest_id,
        step_delay_ms=settings.EXECUTION_STEP_DELAY_MS,
    )

    # Binding store — persisted across restarts
    binding_store = BindingStore(persist_path=settings.BINDING_STORE_PATH)
    binding_store.load_from_file(settings.BINDING_STORE_PATH)

    # Shared asyncio queue feeds both hardware adapters and POST /events
    event_queue: asyncio.Queue[InputEvent] = asyncio.Queue()

    # Recent-events ring buffer powers the live transcription view in the UI.
    recent_events = RecentEventStore(max_events=30, max_fires=30)

    # Dispatcher
    dispatcher = BindingDispatcher(
        store=binding_store,
        adapter=adapter,
        manifest=manifest,
        overlap=settings.DISPATCH_OVERLAP,
        recent_events=recent_events,
    )

    # Input adapters (keyboard/audio/camera based on settings flags)
    input_adapters = get_input_adapters(settings)
    for ia in input_adapters:
        ia.start(event_queue)
        logger.info(f"Input adapter started: {ia.input_type()}")

    # Store shared state on app so routes can access it via request.app.state
    app.state.settings = settings
    app.state.manifest = manifest
    app.state.adapter = adapter
    app.state.mock_adapter = mock_adapter
    app.state.binding_store = binding_store
    app.state.event_queue = event_queue
    app.state.recent_events = recent_events
    app.state.input_adapters = input_adapters

    # Background tasks
    dispatcher_task = asyncio.create_task(
        dispatcher.run(event_queue), name="binding-dispatcher"
    )

    logger.info(
        f"Companion ready — adapter={settings.ADAPTER}, "
        f"host={settings.COMPANION_HOST}:{settings.COMPANION_PORT}"
    )

    yield  # server runs here

    # Shutdown
    dispatcher_task.cancel()
    try:
        await dispatcher_task
    except asyncio.CancelledError:
        pass

    for ia in input_adapters:
        ia.stop()

    close_fn = getattr(adapter, "close", None)
    if callable(close_fn):
        try:
            close_fn()
        except Exception:
            logger.warning("adapter.close() failed", exc_info=True)

    logger.info("Companion shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ReWire Companion",
        description="NL-driven robot control companion service",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        # Accept any localhost / 127.0.0.1 dev origin on any port so that vite
        # falling back to 5174/5175/etc. when 5173 is taken still works.
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(manifest.router)
    app.include_router(inputs_route.router)
    app.include_router(plan.router)
    app.include_router(execute.router)
    app.include_router(fallback.router)
    app.include_router(bindings.router)
    app.include_router(events.router)

    return app


app = create_app()
