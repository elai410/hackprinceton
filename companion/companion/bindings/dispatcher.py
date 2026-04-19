"""
BindingDispatcher — long-running async task.
Consumes InputEvents from the shared queue, matches against stored bindings,
validates matched plans, and executes them via the robot adapter.
Owned by WS-B.
"""

import asyncio
import logging
from typing import Optional

from companion.adapters.base import RobotAdapter
from companion.bindings.matcher import match_event
from companion.bindings.store import BindingStore
from companion.events.recent import RecentEventStore
from companion.models import ExecuteTrace, InputEvent, Manifest, StepResult
from companion.validate import validate_plan

logger = logging.getLogger(__name__)


class BindingDispatcher:
    def __init__(
        self,
        store: BindingStore,
        adapter: RobotAdapter,
        manifest: Manifest,
        overlap: str = "drop",
        recent_events: Optional[RecentEventStore] = None,
    ) -> None:
        self._store = store
        self._adapter = adapter
        self._manifest = manifest
        self._overlap = overlap  # "drop" | "queue"
        self._executing = False
        # Optional UI/debug ring buffer. None disables the live transcription
        # feed without affecting dispatch.
        self._recent = recent_events

    async def run(self, queue: "asyncio.Queue[InputEvent]") -> None:
        """
        Long-running task. Call via asyncio.create_task(dispatcher.run(queue)).
        Cancellation is handled cleanly.
        """
        while True:
            try:
                event: InputEvent = await queue.get()
                await self._handle(event)
            except asyncio.CancelledError:
                logger.info("BindingDispatcher shutting down")
                break
            except Exception as exc:
                logger.error(f"BindingDispatcher unhandled error: {exc}")

    async def _handle(self, event: InputEvent) -> None:
        # Always record the event for the UI feed, even if no binding matches.
        # The user wants to SEE that the mic is hearing them.
        if self._recent is not None:
            self._recent.record_event(event)

        config = self._store.get()
        matches = match_event(event, config)
        if not matches:
            return

        if self._executing and self._overlap == "drop":
            logger.debug(
                f"Dropping {event.type} event: execution already in progress"
            )
            return

        for binding in matches:
            errors = validate_plan(self._manifest, binding.plan)
            if errors:
                msg = "; ".join(f"{e.path}: {e.message}" for e in errors)
                logger.error(
                    f"Binding '{binding.binding_id}' plan failed validation "
                    f"(will not execute): {msg}"
                )
                if self._recent is not None:
                    self._recent.record_fire(binding.binding_id, ok=False, detail=msg)
                continue

            self._executing = True
            try:
                trace = await asyncio.to_thread(self._execute_sync, binding)
                ok = all(s.status == "completed" for s in trace.steps)
                logger.info(
                    f"Binding '{binding.binding_id}' executed "
                    f"({'ok' if ok else 'FAILED'})"
                )
                if self._recent is not None:
                    self._recent.record_fire(
                        binding.binding_id,
                        ok=ok,
                        detail="" if ok else "one or more steps failed",
                    )
            except Exception as exc:
                logger.error(f"Binding '{binding.binding_id}' execution error: {exc}")
                if self._recent is not None:
                    self._recent.record_fire(
                        binding.binding_id, ok=False, detail=str(exc)
                    )
            finally:
                self._executing = False

    def _execute_sync(self, binding) -> ExecuteTrace:
        """Synchronous plan execution run in a thread via asyncio.to_thread."""
        from datetime import datetime, timezone

        results: list[StepResult] = []
        for i, step in enumerate(binding.plan.steps):
            result = self._adapter.execute_skill_call(step)
            result.index = i
            results.append(result)
            if result.status == "failed":
                logger.error(
                    f"Step {i} ({step.skill_id}) failed: {result.detail}; "
                    "remaining steps skipped"
                )
                now = datetime.now(timezone.utc).isoformat()
                for j, remaining in enumerate(binding.plan.steps[i + 1:], start=i + 1):
                    results.append(StepResult(
                        index=j,
                        skill_id=remaining.skill_id,
                        arguments=remaining.arguments,
                        status="skipped",
                        detail="skipped due to prior failure",
                        started_at=now,
                        ended_at=now,
                    ))
                break
        return ExecuteTrace(plan_id=binding.plan.plan_id, steps=results)
