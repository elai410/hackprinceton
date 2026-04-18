from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone

from companion.models import InputEvent

logger = logging.getLogger(__name__)

# Canonical gesture names — MUST exactly match examples/input_event_schema.json
# K2 is only allowed to reference names from that file.
VALID_GESTURES: frozenset[str] = frozenset({
    "wave_left",
    "wave_right",
    "fist",
    "open_hand",
    "thumbs_up",
    "point_up",
})


class CameraInputAdapter:
    """
    Detects hand gestures via webcam using MediaPipe Hands.
    Pushes InputEvent(type="gesture", payload={"gesture": <name>, "hand": "left"|"right"}).
    Only emits gestures in VALID_GESTURES — prevents K2 from hallucinating gesture names
    that the camera never actually emits.

    Requires: pip install opencv-python mediapipe
    """

    def __init__(self, camera_index: int = 0) -> None:
        self._camera_index = camera_index
        self._queue: "asyncio.Queue[InputEvent] | None" = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, queue: "asyncio.Queue[InputEvent]") -> None:
        self._queue = queue
        self._loop = asyncio.get_event_loop()
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="camera-input")
        self._thread.start()
        logger.info("CameraInputAdapter started")

    def stop(self) -> None:
        self._stop_event.set()

    def input_type(self) -> str:
        return "camera"

    # ------------------------------------------------------------------
    # Gesture classification
    # ------------------------------------------------------------------

    @staticmethod
    def _finger_extended(landmarks: list, tip: int, pip: int) -> bool:
        """True if a finger is extended (tip above PIP joint in image coords)."""
        return landmarks[tip].y < landmarks[pip].y

    def _classify_gesture(self, landmarks: list, hand: str) -> str | None:
        """
        Classify the gesture from MediaPipe hand landmarks.
        Returns a name from VALID_GESTURES or None if unrecognised.

        Landmark indices (MediaPipe convention):
        4=thumb_tip, 8=index_tip, 12=middle_tip, 16=ring_tip, 20=pinky_tip
        3=thumb_ip,  6=index_pip, 10=middle_pip, 14=ring_pip, 18=pinky_pip
        """
        lm = landmarks
        index_up = self._finger_extended(lm, 8, 6)
        middle_up = self._finger_extended(lm, 12, 10)
        ring_up = self._finger_extended(lm, 16, 14)
        pinky_up = self._finger_extended(lm, 20, 18)
        thumb_up = lm[4].y < lm[3].y  # thumb tip above IP joint

        fingers_up = sum([index_up, middle_up, ring_up, pinky_up])

        if fingers_up == 0 and not thumb_up:
            return "fist"
        if fingers_up == 4:
            return "open_hand"
        if thumb_up and fingers_up == 0:
            return "thumbs_up"
        if index_up and not middle_up and not ring_up and not pinky_up:
            return "point_up"
        if index_up and middle_up and not ring_up and not pinky_up:
            # Waving: classify by hand side
            return "wave_left" if hand == "left" else "wave_right"
        return None

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def _run(self) -> None:
        try:
            import cv2
            import mediapipe as mp

            mp_hands = mp.solutions.hands
            hands = mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.7,
                min_tracking_confidence=0.6,
            )
            cap = cv2.VideoCapture(self._camera_index)
            if not cap.isOpened():
                logger.error(f"CameraInputAdapter: could not open camera {self._camera_index}")
                return

            # Debounce: only emit when gesture changes
            last_gesture: dict[str, str | None] = {"left": None, "right": None}

            while not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    logger.warning("CameraInputAdapter: failed to read frame")
                    break

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = hands.process(rgb)

                detected: dict[str, str | None] = {"left": None, "right": None}

                if result.multi_hand_landmarks and result.multi_handedness:
                    for lm_obj, handedness_obj in zip(
                        result.multi_hand_landmarks, result.multi_handedness
                    ):
                        hand = handedness_obj.classification[0].label.lower()
                        gesture = self._classify_gesture(lm_obj.landmark, hand)
                        if gesture in VALID_GESTURES:
                            detected[hand] = gesture

                for hand, gesture in detected.items():
                    if gesture != last_gesture[hand]:
                        last_gesture[hand] = gesture
                        if gesture is not None:
                            event = InputEvent(
                                type="gesture",
                                payload={"gesture": gesture, "hand": hand},
                                timestamp=datetime.now(timezone.utc).isoformat(),
                            )
                            if self._loop is not None and self._queue is not None:
                                asyncio.run_coroutine_threadsafe(
                                    self._queue.put(event), self._loop
                                )

            cap.release()
            hands.close()

        except ImportError:
            logger.warning(
                "opencv-python or mediapipe not installed; CameraInputAdapter disabled. "
                "pip install opencv-python mediapipe"
            )
        except Exception as exc:
            logger.error(f"CameraInputAdapter error: {exc}")
