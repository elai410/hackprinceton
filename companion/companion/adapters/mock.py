import time
from datetime import datetime, timezone

from companion.models import SkillCall, StepResult


class MockAdapter:
    """
    Contract twin of the real adapter: same interface, no serial/USB.
    Logs each call, optionally sleeps to simulate motion, and maintains
    trivial in-memory joint state so tests can assert state changes.
    """

    def __init__(self, manifest_id: str, step_delay_ms: int = 0) -> None:
        self._manifest_id = manifest_id
        self._step_delay_ms = step_delay_ms
        # Optional in-memory fake joint state: joint_index -> angle_deg
        self._joint_state: dict[int, float] = {}

    def execute_skill_call(self, call: SkillCall) -> StepResult:
        started_at = datetime.now(timezone.utc).isoformat()

        if self._step_delay_ms > 0:
            time.sleep(self._step_delay_ms / 1000.0)

        # Update fake state for skills that have observable state
        if call.skill_id == "go_home":
            self._joint_state.clear()
        elif call.skill_id == "set_joint_angle":
            ji = call.arguments.get("joint_index")
            ad = call.arguments.get("angle_deg")
            if ji is not None and ad is not None:
                self._joint_state[int(ji)] = float(ad)
        elif call.skill_id == "pan_left":
            deg = float(call.arguments.get("degrees", 0))
            self._joint_state[0] = self._joint_state.get(0, 0.0) - deg
        elif call.skill_id == "pan_right":
            deg = float(call.arguments.get("degrees", 0))
            self._joint_state[0] = self._joint_state.get(0, 0.0) + deg

        ended_at = datetime.now(timezone.utc).isoformat()
        return StepResult(
            index=0,  # caller sets the correct index
            skill_id=call.skill_id,
            arguments=call.arguments,
            status="completed",
            detail=f"mock: executed {call.skill_id} with {call.arguments}",
            started_at=started_at,
            ended_at=ended_at,
        )

    def get_manifest_id(self) -> str:
        return self._manifest_id

    def health(self) -> dict:
        return {"adapter": "mock", "joint_state": dict(self._joint_state)}
