"""
Adeept 5 DOF robot adapter — Phase C.

Stub until the hardware bring-up session. The class structure and interface
are final; replace the NotImplementedError bodies with real serial/SDK calls.

Runbook (fill in during Phase C):
- USB device:   /dev/ttyUSB0  (or ttyACM0 on some Linux distros; COMx on Windows)
- Baud rate:    115200
- Permissions:  sudo usermod -aG dialout $USER  (Linux)
- Known-good home pose: all servos at 90°
- E-stop: unplug USB or call go_home() followed by power-off
"""

import logging
from datetime import datetime, timezone

from companion.models import SkillCall, StepResult

logger = logging.getLogger(__name__)


class AdeeptAdapter:
    def __init__(self, manifest_id: str, port: str = "/dev/ttyUSB0") -> None:
        self._manifest_id = manifest_id
        self._port = port
        # TODO Phase C: open serial connection here
        # import serial
        # self._ser = serial.Serial(port, baudrate=115200, timeout=1)
        logger.warning(
            "AdeeptAdapter: hardware not yet implemented. "
            "Set ADAPTER=mock for development."
        )

    def execute_skill_call(self, call: SkillCall) -> StepResult:
        started_at = datetime.now(timezone.utc).isoformat()
        # TODO Phase C: translate call.skill_id + call.arguments into
        # servo commands and write to self._ser
        ended_at = datetime.now(timezone.utc).isoformat()
        return StepResult(
            index=0,
            skill_id=call.skill_id,
            arguments=call.arguments,
            status="failed",
            detail="AdeeptAdapter not yet implemented",
            started_at=started_at,
            ended_at=ended_at,
        )

    def get_manifest_id(self) -> str:
        return self._manifest_id

    def health(self) -> dict:
        return {"adapter": "adeept", "status": "not_implemented"}
