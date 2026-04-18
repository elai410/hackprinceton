# Rewire

Natural language robot control for the Adeept 5 DOF arm. Describe what you want in plain English; K2 reasons about it and configures the arm.

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

```bash
cd web
echo "VITE_COMPANION_URL=http://127.0.0.1:8000" > .env
npm install
npm run dev    # → http://127.0.0.1:5173
```

### 3. Real arm (Phase C)

Set `ADAPTER=adeept` in `.env` and connect the USB cable. Fill in the serial port and SDK calls in `companion/companion/adapters/adeept.py`.

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
| `INPUTS_AUDIO_ENABLED` | `true` for clap detection (needs sounddevice) |
| `INPUTS_CAMERA_ENABLED` | `true` for gesture detection (needs mediapipe) |
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
