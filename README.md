# ReWire

**Reprogram the physical world with natural language.**

ReWire is the AI-native control layer for consumer robotics. Describe a behavior in plain English ("when you hear good night, tuck in for the night"), and a reasoning model composes the routine, explains it back, and runs it locally on your robot. Wire any input — voice, keystroke, sensor — to any robot's capabilities. No SDK. No firmware. Just language.

Think *Zapier for the physical world*: a single integration layer that turns the long tail of programmable robots into something anyone can customize.

*Cultural footnote: inspired by Rocky from Andy Weir's Project Hail Mary — the alien who became a best friend through nothing but patient communication. We think every robot deserves a translator.*

## Quick start

### 1. Companion (Python)

```bash
cd companion
python -m venv .venv && source .venv/bin/activate
pip install -e .
# Optional: enable camera/audio/keyboard input adapters
# pip install -e ".[inputs]"

cp ../.env.example .env
# Edit .env — set K2_API_KEY (IFM K2-Think) and/or ANTHROPIC_API_KEY for Claude fallback
# Set ADAPTER=mock for dev without hardware

uvicorn companion.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: `curl http://localhost:8000/health`

### 2. Web client

A bright, editorial React + Tailwind interface (sharp corners, serif display +
Inter, inspired by [mersi-architecture.com](https://www.mersi-architecture.com)).

```bash
cd web
cp .env.example .env       # VITE_COMPANION_URL=http://127.0.0.1:8000
npm install
npm run dev                # → http://127.0.0.1:5173
```

Flow: describe a behavior on the **left**, the planner shows its reasoning, you
verify and edit the workflow blocks on the **right**, then **Run** — blocks
light up as they execute. Use **Dry run** to preview without moving the arm.

The frontend calls `GET /health`, `GET /manifest`, `POST /plan`, and
`POST /execute`. It uses the Web Speech API for voice input where supported.

### 3. Real arm (Phase C)

Set `ADAPTER=adeept` in `.env`, fill in `ADEEPT_PORT`, and follow **Hardware bring-up** below.

---

## Hardware bring-up (Adeept ADA031 5 DOF)

One-time setup before the `adeept` adapter can talk to the arm.

1. **Install the CH340 USB-serial driver.** macOS pkg lives at
   `docs/ADA031-Adeept_Robotic_Arm_Kit_for_Arduino-V4.0-20251205/Software Package/Adeept driver/CH341SER_MAC.ZIP`
   (Windows / Linux variants are in the same folder). Reboot if the installer asks.
2. **Install the bundled Arduino libraries** from
   `docs/ADA031-.../Software Package/libraries/` into your Arduino IDE
   (`ArduinoJson`, `Servo`, `SSD1306Ascii`).
3. **Flash the firmware.** Open
   `docs/ADA031-.../Software Package/block_py/block_py.ino`
   in the Arduino IDE, select board "Arduino Uno" @ 115200 baud, and upload.
4. **Identify the serial port** and set `ADEEPT_PORT` in `.env`:
   - macOS: `ls /dev/tty.usbserial-*`
   - Linux: `ls /dev/ttyUSB*` (you may need `sudo usermod -aG dialout $USER` then re-login)
   - Windows: Device Manager → Ports (COM & LPT) → e.g. `COM3`
5. **Power-on order matters.** Plug in the **12 V supply first**, then the USB
   cable. Powering servos from USB alone causes brown-outs under load.
6. **Switch the adapter and restart** the companion:

   ```bash
   # in .env
   ADAPTER=adeept
   ADEEPT_PORT=/dev/tty.usbserial-1410   # whatever step 4 found
   ```

7. **Smoke test:**

   ```bash
   curl -s localhost:8000/health | jq                 # adapter: "adeept"
   curl -s -X POST localhost:8000/execute \
     -H 'content-type: application/json' \
     -d '{"plan":{"steps":[
       {"skill_id":"go_home","arguments":{}},
       {"skill_id":"wave","arguments":{"repetitions":2}},
       {"skill_id":"oled_text","arguments":{"text":"hello rewire"}}
     ]}}' | jq
   ```

   Expected: arm returns to home, waves twice on the shoulder joint, OLED
   shows "hello rewire", and the response trace reports `status: "completed"`
   per step.

If the adapter cannot open the port (missing `ADEEPT_PORT`, wrong device,
firmware not flashed) the companion logs a warning and falls back to the
mock adapter so the rest of the stack still boots.

---

## Inputs (triggers)

ReWire decouples *what triggers an action* from *what device hosts the trigger*.
Any number of input adapters can run side-by-side; each emits `InputEvent`s
into a shared queue, the **BindingDispatcher** matches them against stored
bindings, and the matching plan is validated and run on the robot.

| Source | Where it runs | Event `type` | Payload shape |
|---|---|---|---|
| **Speech** (open-source Whisper) | Companion (laptop, Pi, NUC…) | `speech` | `{text, normalized, language, duration_s, confidence, source}` |
| **Clap** (amplitude) | Companion | `clap` | `{count}` |
| **Keyboard** (pynput) | Companion | `key` | `{key, action}` |
| **Camera gesture** (MediaPipe) | Companion | `gesture` | adapter-defined |
| **Anything else** (phone, watch, smart speaker, hardware button…) | External device | any | any — POST to `/events` |

The microphone does **not** need to live next to the robot. Examples:

- The **default**: laptop mic → companion-hosted Whisper → events on the same
  process.
- A phone in your pocket transcribing locally and POSTing
  `{type: "speech", payload: {text, normalized}}` to `http://<companion>:8000/events`.
- A smart-speaker bridge or a smartwatch app doing the same.

### Enabling local speech (laptop mic + Whisper)

```bash
cd companion
pip install -e ".[speech]"           # ~200 MB; CTranslate2 backend
# in .env (root):
INPUTS_SPEECH_ENABLED=true
SPEECH_MODEL_SIZE=base.en            # tiny.en is faster, small.en more accurate
SPEECH_DEVICE=cpu                    # use "cuda" if you have an NVIDIA GPU
```

Restart the companion. First boot downloads the model (~150 MB for `base.en`)
to `~/.cache/huggingface/hub`; subsequent starts are instant. Watch the log:

```
INFO  SpeechInputAdapter: loading whisper 'base.en' on cpu (int8)…
INFO  SpeechInputAdapter: model ready in 2.3s — listening on default input
INFO  SpeechInputAdapter: heard 'hello' (0.62s, lang=en)
```

### Authoring bindings

`examples/bindings.example.json` shows the format. Speech triggers can match
exactly (`"normalized": "wave hello"`) or by **substring** with a leading `~`
(`"normalized": "~hello"` fires when "hello" appears anywhere in the
transcript). Hot-load with:

```bash
curl -X PUT http://localhost:8000/bindings \
  -H 'content-type: application/json' \
  -d @examples/bindings.example.json
```

Or generate them via natural language (uses K2):

```bash
curl -X POST http://localhost:8000/bindings/configure \
  -H 'content-type: application/json' \
  -d '{"user_text":"when you hear hello, wave three times then go home"}'
```

### Posting events from anywhere

Any client can act as an input source by posting to `/events`:

```bash
curl -X POST http://localhost:8000/events \
  -H 'content-type: application/json' \
  -d '{
    "type": "speech",
    "payload": {"text": "hello there", "normalized": "hello there", "source": "phone"},
    "timestamp": "2026-04-19T02:45:00Z"
  }'
```

The dispatcher treats it identically to events from the local Whisper adapter.

---

## Environment variables

See `.env.example` for all variables. Critical ones:

| Variable | Purpose |
|---|---|
| `ADAPTER` | `mock` (default) or `adeept` |
| `MANIFEST_PATH` | Path to robot manifest JSON |
| `K2_API_KEY` | IFM K2-Think primary planner key (`https://api.k2think.ai/v1`, model `MBZUAI-IFM/K2-Think-v2`) |
| `ANTHROPIC_API_KEY` | Fallback planner key (Claude, e.g. `claude-3-5-sonnet-latest`) |
| `INPUTS_KEYBOARD_ENABLED` | `true` to capture key presses (default true) |
| `INPUTS_AUDIO_ENABLED` | `true` for clap detection (needs `sounddevice`) |
| `INPUTS_SPEECH_ENABLED` | `true` for local mic + open-source Whisper STT (needs `faster-whisper`) |
| `INPUTS_CAMERA_ENABLED` | `true` for gesture detection (needs `mediapipe`) |
| `SPEECH_MODEL_SIZE` | `tiny.en` / `base.en` / `small.en` (default `base.en`) |
| `VITE_COMPANION_URL` | Web client → companion URL (set in `web/.env`) |

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + manifest_id + adapter |
| `POST` | `/plan` | NL → reasoning + optional clarification + plan |
| `POST` | `/execute` | Validate plan then run adapter (`dry_run: true` = mock only) |
| `POST` | `/execute/fallback` | Load `FALLBACK_PLAN_PATH`, validate, execute |
| `GET` | `/bindings` | Current active bindings |
| `POST` | `/bindings/configure` | NL → K2 → bindings (hot-reload, no restart) |
| `PUT` | `/bindings` | Manual binding hot-reload |
| `DELETE` | `/bindings/{id}` | Remove one binding |
| `POST` | `/events` | Inject an InputEvent from browser into dispatcher queue |

---

## Repository layout

```
companion/          Python package (FastAPI companion service)
  companion/
    models.py       All Pydantic models — the shared contract
    validate.py     validate_plan() — pure function, no I/O
    settings.py     pydantic-settings from env
    main.py         FastAPI app + lifespan (start/stop adapters + dispatcher)
    adapters/       RobotAdapter protocol + MockAdapter + AdeeptAdapter stub
    inputs/         InputAdapter protocol + KeyboardAdapter + AudioAdapter + CameraAdapter
    bindings/       BindingStore + match_event() + BindingDispatcher
    planner/        plan_from_nl() + bindings_from_nl() + prompt builders
    routes/         One file per endpoint group
examples/           JSON fixtures: manifest, plans, bindings, input event schema
web/                Vite + TypeScript browser client (no framework)
docs/               Architecture docs
```

---

## Workstream ownership

| WS | Files | Focus |
|---|---|---|
| **WS-A** | `models.py`, `validate.py`, `bindings/store.py`, `bindings/matcher.py`, `examples/` | Contracts + validation |
| **WS-B** | `main.py`, `settings.py`, `adapters/`, `inputs/`, `bindings/dispatcher.py`, `routes/health`, `routes/execute`, `routes/fallback`, `routes/bindings`, `routes/events` | Companion + hardware |
| **WS-C** | `planner/`, `routes/plan.py` | K2 + fallback planner |
| **WS-D** | `web/` | Browser client |

---

## Safety

- `validate_plan()` runs before every adapter call — on `POST /execute` AND in the binding dispatcher.
- `dry_run: true` always uses the mock adapter regardless of `ADAPTER` setting.
- Never commit `.env`.
- E-stop: call `POST /execute` with `{"plan": {"steps": [{"skill_id": "go_home", "arguments": {}}]}, "dry_run": false}` or unplug USB.
