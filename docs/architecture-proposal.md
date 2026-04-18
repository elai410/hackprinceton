# Rewire — Architecture Proposal

## 1. Repository Structure

```
rewire/                          # repo root
├── .env.example                 # all env vars, empty values, committed
├── .gitignore
├── README.md                    # setup, run instructions, env config
│
├── companion/                   # Python package root
│   ├── pyproject.toml           # deps: fastapi, uvicorn, pydantic, pydantic-settings, openai, httpx
│   └── companion/
│       ├── __init__.py
│       ├── main.py              # FastAPI app creation, router mounts, CORS, lifespan
│       ├── settings.py          # pydantic-settings: all env vars as typed fields
│       ├── models.py            # ALL Pydantic v2 models (Manifest, Plan, SkillCall, every request/response)
│       ├── validate.py          # validate_plan(manifest, plan) -> list[ValidationError]; raises on fatal
│       ├── adapters/
│       │   ├── __init__.py      # get_adapter(settings) -> RobotAdapter factory
│       │   ├── base.py          # RobotAdapter Protocol: execute_skill_call, get_manifest_id, health
│       │   ├── mock.py          # MockAdapter: logs trace, optional sleep, no serial
│       │   └── adeept.py        # AdeeptAdapter: real serial/SDK calls; stub NotImplemented until Phase C
│       ├── planner/
│       │   ├── __init__.py
│       │   ├── service.py       # plan_from_nl(request, manifest, settings) -> PlanResponse; K2 + fallbacks
│       │   └── prompts.py       # system prompt template + user prompt builder (strings only)
│       └── routes/
│           ├── __init__.py
│           ├── health.py        # GET /health
│           ├── plan.py          # POST /plan (delegates to planner/service.py)
│           ├── execute.py       # POST /execute (validate then adapter)
│           └── fallback.py      # POST /execute/fallback (load file, validate, execute)
│
├── examples/
│   ├── manifest.adeept.json     # Adeept 5 DOF manifest with all real skills and bounds
│   ├── plan.valid.json          # valid 2-step plan for smoke tests
│   ├── plan.invalid.json        # plan with out-of-bounds args for validator tests
│   └── plan.fallback.json       # minimal guaranteed-valid plan for judge backup
│
├── web/
│   ├── index.html               # entry point; imports /src/main.ts
│   ├── package.json             # deps: vite, typescript; no framework
│   ├── tsconfig.json
│   ├── vite.config.ts           # sets VITE_COMPANION_URL from env
│   └── src/
│       ├── types.ts             # TypeScript mirrors of companion Pydantic models (no logic)
│       ├── api.ts               # all fetch calls to companion (plan, execute, fallback, health)
│       ├── state.ts             # mutable app state: session_id, currentPlan, trace, ui phase
│       ├── main.ts              # entry: wires DOM events → state → api → render
│       └── components/
│           ├── PlanForm.ts      # NL text input, voice toggle, clarification reply UI
│           ├── ReasoningStream.ts  # renders reasoning text block or stream chunks
│           └── BlockList.ts     # read-only block list: one card per SkillCall, trace status
│
└── docs/                        # do not modify during build
    ├── AGENTS.md
    ├── build-spec.md
    └── project-brief-for-pm.md
```

---

## 2. Workstream Ownership

No file is co-owned. Cross-stream changes go through a quick verbal sync.

| File/Dir | Owner | Notes |
|---|---|---|
| `companion/companion/models.py` | WS-A (Contracts) | First file written; everyone depends on it |
| `companion/companion/validate.py` | WS-A | |
| `examples/*.json` | WS-A | Authored fixtures; manifest is the authority |
| `.env.example` | WS-A | |
| `companion/companion/main.py` | WS-B (Companion) | App wiring only |
| `companion/companion/settings.py` | WS-B | |
| `companion/companion/adapters/` | WS-B | base.py + mock.py first; adeept.py once hardware is on hand |
| `companion/companion/routes/health.py` | WS-B | |
| `companion/companion/routes/execute.py` | WS-B | |
| `companion/companion/routes/fallback.py` | WS-B | |
| `companion/companion/planner/prompts.py` | WS-C (Planner) | |
| `companion/companion/planner/service.py` | WS-C | |
| `companion/companion/routes/plan.py` | WS-C | thin route; delegates fully to service.py |
| `web/src/types.ts` | WS-D (Web) | copy of models; WS-A reviews parity |
| `web/src/api.ts` | WS-D | |
| `web/src/state.ts` | WS-D | |
| `web/src/main.ts` | WS-D | |
| `web/src/components/` | WS-D | |
| `web/*.json`, `web/index.html` | WS-D | |
| `README.md` | WS-B (shell) + all | each WS adds their run step |

---

## 3. Interface Contracts

### Contract 0 — `models.py` (WS-A → everyone)

Every other module imports types from here. No logic lives here.

```
Manifest          { manifest_id, robot_label, skills: list[Skill] }
Skill             { id, display_name, description, parameters, constraints }
SkillCall         { skill_id, arguments }
Plan              { plan_id?, steps: list[SkillCall] }
ValidationError   { path, message }

PlanRequest       { session_id?, user_text, clarification_replies: list[str] }
PlanResponse      { reasoning, needs_clarification, questions, plan?, validation_errors, model_used }

ExecuteRequest    { plan: Plan, dry_run: bool }
StepResult        { index, skill_id, arguments, status, detail, started_at, ended_at }
ExecuteTrace      { plan_id, steps: list[StepResult] }
ExecuteResponse   { ok, trace: ExecuteTrace }

FallbackRequest   { use_fallback_file: bool }
HealthResponse    { status, manifest_id, adapter }
ErrorDetail       { code, message, details? }
ErrorResponse     { error: ErrorDetail }
```

`status` is a `Literal["pending", "running", "completed", "failed", "skipped"]`.

---

### Contract 1 — `validate.py` (WS-A → WS-B, WS-C)

```python
validate_plan(manifest: Manifest, plan: Plan) -> list[ValidationError]
```

- Returns empty list if valid.
- Returns one or more `ValidationError` if any `SkillCall` references an unknown `skill_id`, any argument is out of bounds, or `steps` is empty.
- Does not raise; callers decide whether to HTTP-reject.
- No I/O; pure function; testable standalone.

WS-B calls this in `POST /execute` before touching any adapter.
WS-C calls this after the LLM returns a plan, before returning `PlanResponse`.

---

### Contract 2 — `adapters/base.py` (WS-A defines Protocol; WS-B implements)

```python
Protocol RobotAdapter:
    def execute_skill_call(call: SkillCall) -> StepResult
    def get_manifest_id() -> str
    def health() -> dict    # {"adapter": "mock"|"adeept", ...}
```

- `execute_skill_call` is synchronous (may block for hardware duration).
- On hardware failure, returns a `StepResult` with `status="failed"` and a `detail` string — does not raise.
- The route layer decides whether to abort remaining steps on failure.
- `MockAdapter` and `AdeeptAdapter` both implement this Protocol.
- `get_adapter(settings) -> RobotAdapter` factory in `adapters/__init__.py` reads `settings.ADAPTER` and returns the right instance.

---

### Contract 3 — `planner/service.py` (WS-C → WS-B route)

```python
plan_from_nl(
    request: PlanRequest,
    manifest: Manifest,
    settings: Settings,
) -> PlanResponse
```

- Never raises for LLM failures; wraps all errors into `PlanResponse` with `plan=None` and `validation_errors` containing `PLANNER_ERROR`.
- Internally calls `validate_plan` before returning a non-null plan.
- Takes `settings` so it can access API keys, model names, timeout, fallback order.
- WS-B route `plan.py` calls this function; the route does no business logic itself.

---

### Contract 4 — HTTP surface (WS-B implements; WS-D consumes)

| Endpoint | Request type | Response type |
|---|---|---|
| `GET /health` | — | `HealthResponse` |
| `POST /plan` | `PlanRequest` | `PlanResponse` |
| `POST /execute` | `ExecuteRequest` | `ExecuteResponse` |
| `POST /execute/fallback` | `FallbackRequest` | `ExecuteResponse` |

All errors return `ErrorResponse` with one of: `VALIDATION_ERROR`, `PLANNER_ERROR`, `ADAPTER_ERROR`, `INTERNAL_ERROR`.

WS-D must treat this as the only stable interface to the companion and must not assume any additional fields.

---

### Contract 5 — `web/src/types.ts` (WS-A reviews; WS-D owns)

TypeScript mirrors of Contract 0. WS-D writes these; WS-A signs off that field names match exactly. These are the only types WS-D uses — no `any`, no ad-hoc inline shapes in `api.ts`.

---

### Contract 6 — `web/src/api.ts` (WS-D internal; shape is Contract 4)

```typescript
planFromNL(req: PlanRequest): Promise<PlanResponse>
executePlan(req: ExecuteRequest): Promise<ExecuteResponse>
executeFallback(): Promise<ExecuteResponse>
health(): Promise<HealthResponse>
```

All functions throw a typed `ApiError` (with `code` and `message`) on 4xx/5xx.
`main.ts` and components only call these functions, never `fetch` directly.

---

## 4. Implementation Order (24hr timeline)

**Critical path:** models → validate → mock adapter + execute route → web basic shell → planner → real adapter → polish

### Hour 0–1 `[WS-A]`
- `models.py` + `examples/manifest.adeept.json`
- **← GATE: everyone blocked on this; do it first, together if needed**

### Hour 0–2
- `[WS-A]` `validate.py` + `plan.valid.json` + `plan.invalid.json` + `plan.fallback.json`
- `[WS-D]` `web/src/types.ts` (mirrors models.py as it's written)
- ← these two can parallel once `models.py` is 80% stable

### Hour 1–3 `[WS-B]`
- `settings.py`, `adapters/base.py`, `adapters/mock.py`
- `main.py` (app skeleton, CORS, mount routers as stubs)
- `routes/health.py`, `routes/execute.py`
- **← exit: `curl GET /health` and `POST /execute` with valid plan returns trace**

### Hour 2–4 `[WS-D]`
- `web/` scaffold: `index.html`, vite config, `api.ts`, `state.ts`
- `PlanForm.ts` + `BlockList.ts` + `main.ts` wired to `POST /execute` with `plan.valid.json`
- **← exit: browser can trigger execute, see block list, no planner yet**

### Hour 3–6
- `[WS-C]` `planner/prompts.py` (system prompt template w/ manifest injection)
- `[WS-C]` `planner/service.py` (K2 call, parse, validate, one repair retry, fallback chain)
- `[WS-C]` `routes/plan.py`
- `[WS-B]` `routes/fallback.py`
- **← exit: `POST /plan` with NL returns `PlanResponse`; fallback route loads file**

### Hour 4–6 `[WS-D]`
- `ReasoningStream.ts`, clarification reply UI
- Wire `POST /plan` → show reasoning → confirm → `POST /execute`
- **← exit: full end-to-end in browser with mock adapter**

### Hour 5–8 `[WS-B]`
- `adapters/adeept.py` (real hardware; needs physical access)
- **← exit: same curl plan moves arm**

### Hour 7–10 `[ALL]`
- Integration test: browser NL → K2 → plan → execute on real arm
- `[WS-D]` Loading states, error display, retry button
- `[WS-C]` Test clarification flow + multi-step reasoning
- `[WS-B]` Confirm estop, bounds, timeout handling

### Hour 10+ `[ALL]`
- Demo script, rehearsal, hotspot test, backup video

---

### Parallel work guarantees

- WS-C and WS-B never touch the same files after hour 1.
- WS-D only depends on Contract 4 (HTTP) and Contract 5 (types); it can use curl-verified stubs until WS-C is done.
- WS-B can wire the execute route with the mock adapter before WS-C ships the planner — WS-D uses `plan.valid.json` directly in the interim.

---

## 5. Addendum: Input Modalities and Binding Layer

*Approved additions. Input modalities are CORE DEMO, not stretch.*

### 5.1 New files

```
companion/companion/
├── inputs/
│   ├── __init__.py        # get_input_adapters(settings) -> list[InputAdapter]; start/stop all
│   ├── base.py            # InputAdapter Protocol: start(queue), stop(), input_type() -> str
│   ├── camera.py          # CameraInputAdapter: webcam → gesture InputEvents (OpenCV/MediaPipe)
│   ├── audio.py           # AudioInputAdapter: mic → clap InputEvents (sounddevice)
│   └── keyboard.py        # KeyboardInputAdapter: key press InputEvents (pynput)
├── bindings/
│   ├── __init__.py
│   ├── store.py           # BindingStore: thread-safe in-memory config + JSON file backing  [WS-A]
│   ├── matcher.py         # match_event(event, config) -> list[Binding]; pure fn            [WS-A]
│   └── dispatcher.py      # async task: dequeue InputEvent → match → validate → execute
└── routes/
    ├── bindings.py        # GET/POST/PUT /bindings, DELETE /bindings/{id}
    └── events.py          # POST /events (browser injects InputEvent into shared queue)

examples/
└── input_event_schema.json  # [WS-A] every valid InputEvent type + payload keys; used by WS-C in prompts

web/src/components/
└── BindingPanel.ts        # shows active bindings table + configure input
```

### 5.2 Updated workstream ownership (corrections applied)

| File | Owner | Rationale |
|---|---|---|
| `bindings/store.py` | **WS-A** | Pure state with no hardware dependency; same tier as validate.py |
| `bindings/matcher.py` | **WS-A** | Pure function; no I/O; testable standalone |
| `bindings/dispatcher.py` | **WS-B** | Consumes queue; calls adapter |
| `inputs/` (all) | **WS-B** | Hardware-adjacent; runs in companion process |
| `routes/bindings.py`, `routes/events.py` | **WS-B** | Route shells; delegate to store + planner |
| `planner/service.py` `bindings_from_nl()` | **WS-C** | New prompt mode alongside plan_from_nl |
| `examples/input_event_schema.json` | **WS-A** | Authored fixture; WS-C imports it in prompts.py |
| `web/src/components/BindingPanel.ts` | **WS-D** | |

### 5.3 New models (appended to models.py)

```
TriggerPattern      { type: str, payload_match: dict[str, Any] }
Binding             { binding_id, display_name, trigger: TriggerPattern, plan: Plan }
BindingConfig       { config_id?, bindings: list[Binding] }
BindingConfigureRequest   { user_text, session_id? }
BindingConfigureResponse  { bindings, reasoning, validation_errors }
```

### 5.4 New contracts

**Contract 7 — InputAdapter Protocol** (`inputs/base.py`, WS-A defines, WS-B implements)

```
Protocol InputAdapter:
    start(queue: asyncio.Queue[InputEvent]) -> None   # spawns background thread; non-blocking
    stop() -> None                                     # signals thread exit; idempotent
    input_type() -> str                                # "camera" | "audio" | "keyboard"
```

**Contract 8 — BindingStore** (`bindings/store.py`, WS-A)

```
class BindingStore:
    get() -> BindingConfig               # atomic read
    set(config: BindingConfig) -> None   # hot-reload: atomically replaces; persists to BINDING_STORE_PATH
    load_from_file(path: str) -> None    # called on startup; noop if file missing
```

**Contract 9 — match_event** (`bindings/matcher.py`, WS-A)

```
match_event(event: InputEvent, config: BindingConfig) -> list[Binding]
```
Match rule: `trigger.type == event.type` AND all keys in `trigger.payload_match` are present in `event.payload` with equal values. Pure function; no I/O.

**Contract 10 — BindingDispatcher** (`bindings/dispatcher.py`, WS-B)

```
class BindingDispatcher:
    __init__(store, adapter, manifest, overlap="drop")
    async run(queue: asyncio.Queue[InputEvent]) -> None
        # loop: dequeue → match_event → validate_plan → execute each step
        # overlap="drop": skip new event if execution in progress
        # never raises; logs all errors
```

**Contract 11 — bindings_from_nl** (`planner/service.py`, WS-C)

```
bindings_from_nl(request: BindingConfigureRequest, manifest: Manifest, settings: Settings)
    -> BindingConfigureResponse
```
Loads `examples/input_event_schema.json` and injects it into the system prompt so K2 only emits event types and gesture names defined there. Validates each binding's plan before returning.

**Contract 12 — Binding HTTP routes** (new endpoints)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/bindings` | Current `BindingConfig` from store |
| `POST` | `/bindings/configure` | NL → K2 → validate → store → `BindingConfigureResponse` |
| `PUT` | `/bindings` | Manual hot-reload: body `BindingConfig`, validate all plans, store |
| `DELETE` | `/bindings/{binding_id}` | Remove one binding; 404 if not found |
| `POST` | `/events` | Body `InputEvent`; push to shared queue; `{"queued": true}` |

**Contract 13 — input_event_schema.json** (WS-A authors; WS-C reads in prompts.py)

Enumerates every `type` the input adapters can emit and every valid payload key + value set. WS-C injects this JSON verbatim into the binding system prompt. K2 must not reference types or gesture names absent from this file.

### 5.5 New environment variables

```
INPUTS_CAMERA_ENABLED=false
INPUTS_AUDIO_ENABLED=false
INPUTS_KEYBOARD_ENABLED=true
BINDING_STORE_PATH=bindings.json
DISPATCH_OVERLAP=drop           # drop | queue
```

### 5.6 Event flow

```
BINDING PATH (runtime loop):
  Sensor (camera/audio/keyboard) OR browser POST /events
    → asyncio.Queue[InputEvent]
      → BindingDispatcher.run()
        → match_event(event, store.get())
          → validate_plan(manifest, binding.plan)   ← always re-validate
            → adapter.execute_skill_call(...)

CONFIGURE PATH (K2 + NL → stored binding):
  Browser: "when I raise left hand, move arm left"
    → POST /bindings/configure
      → bindings_from_nl()   ← K2 uses input_event_schema.json for grounding
        → validate each plan
          → store.set(BindingConfig)   ← hot-reload; dispatcher picks up immediately

ONE-SHOT PATH (unchanged):
  Browser: "wave hello now"
    → POST /plan → POST /execute
```
