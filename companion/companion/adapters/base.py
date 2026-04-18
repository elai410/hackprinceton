from typing import Protocol, runtime_checkable

from companion.models import SkillCall, StepResult


@runtime_checkable
class RobotAdapter(Protocol):
    def execute_skill_call(self, call: SkillCall) -> StepResult:
        """
        Execute one validated SkillCall.
        Must be synchronous; may block for hardware duration.
        On hardware failure: return StepResult with status="failed" and detail describing the error.
        Must NOT raise.
        """
        ...

    def get_manifest_id(self) -> str:
        """Return the manifest_id this adapter was initialised with."""
        ...

    def health(self) -> dict:
        """Return a dict with at least {"adapter": "<name>"}."""
        ...
