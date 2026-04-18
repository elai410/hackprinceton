"""
Adeept 5 DOF robot adapter.

Speaks the JSON-over-USB protocol implemented by the vendor firmware
(`docs/.../Software Package/block_py/block_py.ino`):

    {"start":["<cmd>", arg1, arg2, ...]}\\n

Wire format notes:
- Baud 115200, line-delimited, ASCII payload.
- Firmware buffer is `char line[60]` so each line MUST be <= 59 bytes (+ '\\n').
- Integer args are read as `long`; we always send ints, never floats.
- Arduino auto-resets when the host opens the serial port (DTR toggle); we
  must wait ~2s and flush the input buffer before the first command.

Concurrency: `/execute` runs sync in FastAPI's threadpool while the binding
dispatcher invokes the adapter via `asyncio.to_thread`. The serial port is
not thread-safe, so every wire write is wrapped in `self._lock`.

The `RobotAdapter` Protocol contract (see `companion/adapters/base.py`)
requires that `execute_skill_call` MUST NOT raise — every code path returns
a `StepResult`.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional

import serial

from companion.models import SkillCall, StepResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Hardware-fixed constants (do NOT move to settings; these describe the arm).
# ---------------------------------------------------------------------------

PIN_MAP: list[int] = [9, 6, 5, 3, 11]
"""Servo index -> Arduino pin. 0=base yaw, 1=shoulder, 2=elbow, 3=wrist, 4=gripper."""

JOINT_RANGES: list[tuple[int, int]] = [
    (0, 180), (0, 180), (0, 180), (0, 180), (30, 100),
]
"""Per-joint (min, max) angle in degrees. Gripper is restricted to 30-100."""

HOME_ANGLES: list[int] = [90, 90, 90, 90, 65]
"""Known-safe starting pose."""

MAX_LINE: int = 59
"""Firmware buffer is char line[60]; longer lines overflow. Excludes trailing newline."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class AdeeptAdapter:
    def __init__(self, manifest_id: str, settings: Any) -> None:
        if not settings.ADEEPT_PORT:
            raise RuntimeError(
                "ADEEPT_PORT not set in .env (required when ADAPTER=adeept)"
            )
        self._manifest_id = manifest_id
        self._lock = threading.Lock()
        self._cur: Optional[list[int]] = None
        self._oled_ready = False
        self._max_speed: float = float(settings.ADEEPT_MAX_SPEED_DEG_S)
        self._tick_s: float = 1.0 / max(1, int(settings.ADEEPT_INTERP_HZ))

        self._ser = serial.Serial(
            settings.ADEEPT_PORT,
            int(settings.ADEEPT_BAUD),
            timeout=1.0,
            write_timeout=2.0,
        )
        # Arduino resets when DTR toggles on port open; let the bootloader run.
        time.sleep(float(settings.ADEEPT_OPEN_RESET_S))
        try:
            self._ser.reset_input_buffer()
        except Exception:
            pass

        self._handshake(float(settings.ADEEPT_HANDSHAKE_TIMEOUT_S))

        for i, pin in enumerate(PIN_MAP):
            self._send("servo_attach", i, pin)
        # Direct-write to home (no interpolation; cache is unknown until now).
        for i, ang in enumerate(HOME_ANGLES):
            self._send("servo_write", i, ang)
        time.sleep(0.8)
        self._cur = list(HOME_ANGLES)
        logger.info(
            "AdeeptAdapter ready on %s @ %d baud",
            settings.ADEEPT_PORT, settings.ADEEPT_BAUD,
        )

    # ------------------------------------------------------------------ wire

    def _send(self, cmd: str, *args: Any) -> None:
        """
        Build a `{"start":[...]}\\n` line and write it. String args are double-
        quoted; numeric args are sent as ints (firmware reads `long`).
        Holds `self._lock` for the duration of the write.
        """
        parts: list[str] = [f'"{cmd}"']
        for a in args:
            if isinstance(a, str):
                parts.append(f'"{a}"')
            else:
                parts.append(str(int(a)))
        line = '{"start":[' + ",".join(parts) + ']}\n'
        if len(line) > MAX_LINE + 1:
            raise ValueError(
                f"serial line too long ({len(line)}B, max {MAX_LINE + 1}): {line!r}"
            )
        with self._lock:
            self._ser.write(line.encode("ascii"))

    def _handshake(self, timeout_s: float) -> None:
        """
        Spam {"start":["setup"]} until the firmware echoes anything, or the
        timeout elapses. Mirrors `Adeept.wiat_connect()` from the vendor demo
        but bounded so init failures surface cleanly.
        """
        deadline = time.monotonic() + max(0.5, timeout_s)
        attempt = 0
        while time.monotonic() < deadline:
            attempt += 1
            with self._lock:
                self._ser.write(b'{"start":["setup"]}\n')
                line = self._ser.readline()
            if line:
                logger.info(
                    "Adeept handshake ok after %d attempt(s): %r", attempt, line
                )
                return
            time.sleep(0.5)
        raise RuntimeError(
            f"Adeept did not respond to setup within {timeout_s:.1f}s "
            f"({attempt} attempts). Is the firmware flashed?"
        )

    def _move_to(self, target: list[int]) -> None:
        """
        Interpolate from cached pose to `target`, sending only changed servos
        per tick. Clamps each axis to JOINT_RANGES.
        """
        clamped: list[int] = [
            max(lo, min(hi, int(round(t))))
            for t, (lo, hi) in zip(target, JOINT_RANGES)
        ]
        if self._cur is None:
            for i, a in enumerate(clamped):
                self._send("servo_write", i, a)
            self._cur = list(clamped)
            return

        max_delta = max(abs(t - c) for t, c in zip(clamped, self._cur))
        if max_delta == 0:
            return

        deg_per_tick = max(1.0, self._max_speed * self._tick_s)
        ticks = max(1, int(round(max_delta / deg_per_tick)))
        prev = list(self._cur)
        start = list(self._cur)
        for k in range(1, ticks + 1):
            interp = [
                int(round(c + (t - c) * k / ticks))
                for c, t in zip(start, clamped)
            ]
            for i, a in enumerate(interp):
                if a != prev[i]:
                    self._send("servo_write", i, a)
            prev = interp
            time.sleep(self._tick_s)
        self._cur = list(clamped)

    # -------------------------------------------------------------- contract

    def execute_skill_call(self, call: SkillCall) -> StepResult:
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            self._dispatch(call)
            status = "completed"
            detail = f"adeept: {call.skill_id} {call.arguments}"
        except Exception as exc:
            logger.exception("Adeept skill failed: %s", call.skill_id)
            status = "failed"
            detail = f"adeept error: {exc}"
        ended_at = datetime.now(timezone.utc).isoformat()
        return StepResult(
            index=0,  # caller (executor) overwrites with the real step index
            skill_id=call.skill_id,
            arguments=call.arguments,
            status=status,
            detail=detail,
            started_at=started_at,
            ended_at=ended_at,
        )

    def _dispatch(self, call: SkillCall) -> None:
        sid = call.skill_id
        args = call.arguments
        cur: list[int] = list(self._cur if self._cur is not None else HOME_ANGLES)

        if sid == "go_home":
            self._move_to(list(HOME_ANGLES))

        elif sid == "set_joint_angle":
            i = int(args["joint_index"])
            cur[i] = int(round(float(args["angle_deg"])))
            self._move_to(cur)

        elif sid == "pan_left":
            cur[0] = int(round(cur[0] - float(args["degrees"])))
            self._move_to(cur)

        elif sid == "pan_right":
            cur[0] = int(round(cur[0] + float(args["degrees"])))
            self._move_to(cur)

        elif sid == "tilt_up":
            cur[1] = int(round(cur[1] - float(args["degrees"])))
            self._move_to(cur)

        elif sid == "tilt_down":
            cur[1] = int(round(cur[1] + float(args["degrees"])))
            self._move_to(cur)

        elif sid == "grip_open":
            cur[4] = 100
            self._move_to(cur)

        elif sid == "grip_close":
            f = int(args.get("force_pct", 50))
            # Higher force_pct -> tighter grip -> smaller angle (65 -> 30 over 10..100).
            cur[4] = int(round(65 - (f - 10) * (65 - 30) / 90))
            self._move_to(cur)

        elif sid == "wave":
            n = int(args.get("repetitions", 2))
            home = list(HOME_ANGLES)
            for _ in range(n):
                p = list(home); p[1] = 70
                self._move_to(p)
                time.sleep(0.15)
                p = list(home); p[1] = 110
                self._move_to(p)
                time.sleep(0.15)
            self._move_to(home)

        elif sid == "oled_text":
            # Validator does not enforce maxLength; truncate as backstop.
            text = str(args.get("text", ""))[:20]
            if not self._oled_ready:
                self._send("OLED_init")
                time.sleep(0.05)
                self._send("OLED_Ts", 2)
                self._oled_ready = True
            self._send("OLED_Clear")
            self._send("OLED_Cursor", 0, 0)
            self._send("OLED_Show", text)

        else:
            raise ValueError(f"unsupported skill_id: {sid}")

    def get_manifest_id(self) -> str:
        return self._manifest_id

    def health(self) -> dict:
        return {
            "adapter": "adeept",
            "port": getattr(self._ser, "port", None),
            "joint_state": list(self._cur) if self._cur is not None else None,
            "oled_ready": self._oled_ready,
        }

    def close(self) -> None:
        try:
            with self._lock:
                if self._ser.is_open:
                    self._ser.close()
        except Exception as exc:
            logger.warning("Adeept close error: %s", exc)
