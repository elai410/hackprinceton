# Engineering build spec (for implementers and coding agents)

Technical source of truth for architecture and contracts unless superseded by checked-in schemas and code.

**Agents:** Implement using **§ Implementation defaults** and **§ JSON contracts** below. Do not substitute other frameworks or API shapes unless the human explicitly approves a deviation.

## Platform decisions (locked for this project)

| Topic | Decision |
| :--- | :--- |
| **Robot** | **Adeept 5 DOF** — reference hardware for manifest + adapter. |
| **Client (MVP)** | **Laptop + browser** (or minimal desktop shell): **typed NL** and/or **Web Speech API** / desktop mic. Primary integration target until the pipeline is stable. |
| **Client (stretch)** | **Native mobile app** on LAN + **on-device STT** — only after MVP works. |
| **Design flow** | **Natural language first** for every new behavior or revision. |
| **MVP vs stretch** | **MVP:** NL → `Plan` → validate → **read-only block list** (preview + execution trace) → execute. **Stretch:** (1) **same block list component** with **editing** enabled; (2) mobile client. |
| **Client ↔ arm** | **Companion process on laptop** (or SBC) adjacent to the arm: **robot adapter** + **HTTP/WebSocket**. MVP uses **localhost or LAN**. Do **not** use BLE or phone USB→serial as the primary path unless validated. |
| **STT (MVP)** | **Browser** (Web Speech API where supported) and/or **text field**; optional OS-level desktop STT. |
| **STT (stretch)** | **On-device** mobile OS speech APIs; send **text** only downstream. |
| **Planner** | **K2 (sponsor) primary** for clarification + reasoning + structured plan generation; **other hosted models** in configurable **fallback order**; **offline** pre-baked `Plan` JSON if all APIs fail. |
| **User-facing safety** | **Do not** surface raw manifest JSON, internal `skill_id` strings, or schema dumps to default UI. Clarification uses **plain language**; optional **advanced** panel is a team choice. |

## Goals

- NL-driven **plans** referencing only **manifest-defined skills**; validate before execute.  
- **Companion service** is the only component that talks to motors on the default architecture.  
- **Input events** (clap, etc.) normalized; triggers bind to plans where in scope.  
- **New robots:** new manifest + adapter behind the same companion contract.  
- Preview via **trace / dry-run** (`POST /execute` with **`"dry_run": true`** or **`ADAPTER=mock`**)—**not** a required 3D or physics simulation; no mandatory sim.

## Architecture

**MVP (laptop + browser)**

```
[ Browser or desktop UI ]
  NL + optional clarification replies; show reasoning stream + final plan preview
       ↓
  Companion: Planner pipeline (K2 → fallback LLMs) → structured Plan JSON
       ↓ validate (manifest server-side only)
  execute → Robot adapter → Adeept 5 DOF
```

**Planner pipeline (conceptual):** (1) optional **clarification** turn(s) using user-safe copy; (2) **reasoning** text for UI (stream or segments); (3) **Plan** JSON output → **validator** → execute. Same manifest grounds all steps; users never **need** to see raw manifest.

**Stretch:** Replace the left column with a **native mobile app** + on-device STT → same companion endpoints.

**Preferred for secrets:** Run planner **on the companion** so the browser/mobile client only sends **plain text** to one IP; API keys stay on the laptop.

## Implementation defaults (use unless human overrides)

These choices remove guesswork for the first vertical slice; the human may swap pieces later.

| Area | Default |
| :--- | :--- |
| **Companion runtime** | **Python 3.11+** |
| **Companion framework** | **FastAPI** + **Uvicorn** |
| **Request/response models** | **Pydantic v2** (aligns with JSON below) |
| **Config** | **`pydantic-settings`** reading **environment variables** (see § Environment variables) |
| **HTTP** | **JSON** over HTTP/1.1; **no WebSocket required** for MVP. Optional **SSE** for `/plan` reasoning via `StreamingResponse`. |
| **CORS** | Enable **CORS** for `http://localhost:*` and `http://127.0.0.1:*` in dev; restrict to known web origin in demo. |
| **Browser client** | **Vite** + **TypeScript** minimal SPA (or static `index.html` + one `app.ts` if speed-critical). **No** framework required beyond what serves the MVP UI. |
| **Package layout** | Monorepo-style: **`companion/`** (Python package), **`web/`** (front-end), **`schemas/`** (JSON Schema copies optional), **`examples/`** (fixtures). |
| **Process model** | **Single** companion process: validator + execute + planner in-process. **No** separate planner microservice for MVP. |
| **Adapter selection** | **`ADAPTER=mock`** or **`ADAPTER=adeept`** (env). Mock is default until hardware works. |
| **Time** | Store UTC **ISO 8601** strings in traces and events. |

### Default bind addresses

| Service | Host | Port | Notes |
| :--- | :--- | :--- | :--- |
| Companion API | `0.0.0.0` (LAN) or `127.0.0.1` | **`8000`** | Set `COMPANION_HOST`, `COMPANION_PORT` |
| Vite dev server | `127.0.0.1` | **`5173`** | Proxies optional; browser calls companion by **full URL** from env `VITE_COMPANION_URL` |

## Repository layout (create on first commit)

```text
companion/
  pyproject.toml          # or requirements.txt: fastapi, uvicorn[standard], pydantic, pydantic-settings, httpx, openai (K2 via OpenAI-compatible client), anthropic (Claude fallback)
  companion/
    __init__.py
    main.py               # FastAPI app, router mount, CORS
    settings.py           # pydantic-settings from env
    models.py             # Pydantic models mirroring § JSON contracts
    validate.py           # validate_plan(manifest, plan) -> raises or ValidationResult
    adapters/
      __init__.py
      base.py             # Protocol or ABC: execute_skill_call(call) -> StepResult
      mock.py
      adeept.py           # stub raise NotImplemented until Phase C
    planner/
      __init__.py
      service.py          # plan_from_nl(...); K2 + fallbacks
      prompts.py          # system + user templates (strings)
    routes/
      health.py
      plan.py
      execute.py
      fallback.py
examples/
  manifest.adeept.json
  plan.valid.json
  plan.invalid.json
  plan.fallback.json
web/
  index.html
  src/
    main.ts               # fetch COMPANION_URL, UI state, block list render
  vite.config.ts          # optional
docs/
  (existing)
```

## Environment variables

| Variable | Required | Example | Purpose |
| :--- | :--- | :--- | :--- |
| `COMPANION_HOST` | no | `0.0.0.0` | Bind address |
| `COMPANION_PORT` | no | `8000` | Bind port |
| `ADAPTER` | no | `mock` | `mock` \| `adeept` |
| `MANIFEST_PATH` | yes | `examples/manifest.adeept.json` | Path to manifest JSON on disk |
| `FALLBACK_PLAN_PATH` | no | `examples/plan.fallback.json` | Used when all LLMs fail |
| `PLANNER_PRIMARY` | Phase E+ | `k2think` | Provider id for routing |
| `K2_API_KEY` | if using K2 | — | IFM K2-Think API key |
| `K2_BASE_URL` | no | `https://api.k2think.ai/v1` | OpenAI-compatible base |
| `ANTHROPIC_API_KEY` | fallback | — | Anthropic Claude key (fallback provider) |
| `PLANNER_MODEL_PRIMARY` | no | `MBZUAI-IFM/K2-Think-v2` | Model id for primary |
| `PLANNER_MODEL_FALLBACKS` | no | `claude-3-5-sonnet-latest` | Comma-separated Claude model ids in order |
| `PLANNER_TIMEOUT_S` | no | `60` | Per-call timeout |
| `EXECUTION_STEP_DELAY_MS` | no | `0` | Mock adapter delay between steps |

**Secrets:** Never commit `.env`; document `.env.example` with empty values.

## JSON contracts (normative shapes)

Use these field names in Pydantic models, OpenAPI, and fixtures. Extra fields are allowed only if marked **extension** and ignored by default clients.

### Manifest (file: `examples/manifest.adeept.json`)

```json
{
  "manifest_id": "adeept_5dof_v1",
  "robot_label": "Adeept 5 DOF",
  "skills": [
    {
      "id": "go_home",
      "display_name": "Go to home pose",
      "description": "Move all joints to a known safe home configuration.",
      "parameters": {},
      "constraints": {}
    },
    {
      "id": "set_joint_angle",
      "display_name": "Set joint angle",
      "description": "Set a single joint angle in degrees.",
      "parameters": {
        "joint_index": { "type": "integer", "minimum": 0, "maximum": 4 },
        "angle_deg": { "type": "number", "minimum": -180, "maximum": 180 }
      },
      "constraints": { "max_speed_deg_s": 30 }
    }
  ]
}
```

**Rules:** `skills[].id` is **`snake_case`**; planner must emit these exact strings as `skill_id`. Every skill **must** have `display_name` (for UI) and `description` (for LLM). `parameters` JSON-Schema-like objects define allowed `arguments` keys and bounds.

### Plan

```json
{
  "plan_id": "optional-uuid",
  "steps": [
    { "skill_id": "go_home", "arguments": {} },
    { "skill_id": "set_joint_angle", "arguments": { "joint_index": 1, "angle_deg": 15.0 } }
  ]
}
```

**Rules:** Execution order is **`steps` array order**. Reject empty `steps` unless explicitly allowed for dry-run tests.

### SkillCall (one element of `steps`)

Same as one object in `steps`: `{ "skill_id": string, "arguments": object }`.

### POST `/plan` request body

```json
{
  "session_id": "uuid-string-optional",
  "user_text": "Wave hello slowly",
  "clarification_replies": []
}
```

For follow-up turns after clarification: put user answers as **strings** in `clarification_replies` **in order** matching server’s questions (or use structured replies in extension—default is ordered list of strings).

### POST `/plan` response body (non-streaming)

```json
{
  "reasoning": "Plain-language explanation for the user.",
  "needs_clarification": false,
  "questions": [],
  "plan": { "plan_id": "generated", "steps": [] },
  "validation_errors": [],
  "model_used": "MBZUAI-IFM/K2-Think-v2"
}
```

**Rules:**

- If `needs_clarification` is **true**, `plan` is **null** and `questions` is a non-empty array of **user-facing strings** (no raw skill ids).
- If `needs_clarification` is **false**, `plan` must be non-null **or** `validation_errors` explains failure; **never** return both a non-null `plan` and non-empty `validation_errors`.
- **`validation_errors`:** array of `{ "path": "/steps/0/arguments/angle_deg", "message": "exceeds maximum 180" }`.

### POST `/execute` request body

```json
{
  "plan": { "plan_id": "x", "steps": [ { "skill_id": "go_home", "arguments": {} } ] },
  "dry_run": false
}
```

If `dry_run` is **true**, companion runs mock path only and returns trace without calling real hardware (even if `ADAPTER=adeept`).

### POST `/execute` response body (success)

```json
{
  "ok": true,
  "trace": {
    "plan_id": "x",
    "steps": [
      {
        "index": 0,
        "skill_id": "go_home",
        "arguments": {},
        "status": "completed",
        "detail": "mock: would execute go_home",
        "started_at": "2026-04-18T12:00:00.000Z",
        "ended_at": "2026-04-18T12:00:00.050Z"
      }
    ]
  }
}
```

**Rules:** `status` is one of **`pending` \| `running` \| `completed` \| `failed` \| `skipped`**.

### GET `/health` response

```json
{
  "status": "ok",
  "manifest_id": "adeept_5dof_v1",
  "adapter": "mock"
}
```

### Error response (4xx/5xx)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Plan rejected",
    "details": { "validation_errors": [] }
  }
}
```

**Codes:** `VALIDATION_ERROR`, `PLANNER_ERROR`, `ADAPTER_ERROR`, `INTERNAL_ERROR`.

### POST `/execute/fallback` request body

When all LLM providers fail and the demo must still move the arm:

```json
{ "use_fallback_file": true }
```

Companion loads **`FALLBACK_PLAN_PATH`**, runs **`validate_plan`**, then executes if valid. Same response shape as **`POST /execute`**.

### InputEvent (for Phase F triggers)

```json
{
  "type": "clap",
  "payload": { "count": 2 },
  "timestamp": "2026-04-18T12:00:00.000Z"
}
```

## Planner integration (concrete)

1. **Client libraries:** **IFM K2-Think** via the `openai` Python package (OpenAI-compatible: `base_url=https://api.k2think.ai/v1`, model `MBZUAI-IFM/K2-Think-v2`); **Claude** fallbacks via the `anthropic` Python package (`AsyncAnthropic`, `messages.create`, `system=` + `messages=[{"role":"user",...}]`).
2. **Single chat completion** per `/plan` request (MVP): system prompt includes **stringified manifest** (JSON minified) + rules: “Output **only** a single JSON object with keys `reasoning`, `needs_clarification`, `questions`, `plan` matching schema. No markdown fences.”
3. **Parse:** Strip markdown code fences if present; `json.loads`; then run **`validate_plan`**; if invalid, **one** repair retry sending validator errors back to the same model; if still invalid, return `validation_errors` and null `plan`.
4. **Fallback chain:** Primary model → each in `PLANNER_MODEL_FALLBACKS` → if all fail, return **`503`** or **`200`** with `plan: null` and `validation_errors` containing code `PLANNER_ERROR`, and have the client call **`POST /execute/fallback`** (see § JSON contracts).
5. **Clarification:** Single-shot prompt asks the model to set `needs_clarification` and `questions`; next **`POST /plan`** passes **`clarification_replies`** (ordered strings) and the same **`session_id`**; client stores **`session_id`** in **`sessionStorage`** (generate UUID v4 in browser if absent).
6. **Model IDs:** **`PLANNER_MODEL_PRIMARY=MBZUAI-IFM/K2-Think-v2`** against **`K2_BASE_URL=https://api.k2think.ai/v1`** with **`Authorization: Bearer $K2_API_KEY`**. Fallbacks (e.g. `claude-3-5-sonnet-latest`) hit Anthropic with `ANTHROPIC_API_KEY`.

## Key terms and components

Authoritative definitions for shared vocabulary. Schemas in-repo may add fields; meanings below stay stable.

### Capability manifest

Machine-readable description of **what this robot integration exposes**: skill identifiers, parameter types, **bounds** (safety limits), and short **descriptions** for humans and the LLM. **Authored** for each integration (e.g. Adeept profile)—not auto-discovered from hardware. Usually one manifest per robot **family** or firmware line, not per end user.

### Skill

A **single entry** in the manifest: a named capability (e.g. move joint, go home) with typed parameters and limits. The planner may only emit **SkillCall**s that reference skills defined here.

### SkillCall

One **invocation** in a plan: `{ skill_id, arguments }`. Arguments must satisfy the manifest for that skill. The executor (via adapters) turns a SkillCall into concrete driver commands.

### Plan

An **ordered list** of **SkillCall**s. Output of the **planner** (after NL); must pass the **validator** before **execute**. In the UI, a plan maps to the **block list** (read-only preview/trace in MVP; editable in stretch).

### Validator

Code that loads the manifest and checks that a **Plan** is well-formed JSON and that **every SkillCall** is allowed and within **bounds**. Runs on the **companion** before any motor command; invalid plans are rejected with actionable errors.

### Companion (service)

Long-running process on the laptop (or SBC) next to the arm: **HTTP/WebSocket** API, hosts the **manifest**, runs the **validator**, routes **execute** to the **robot adapter** (or mock), and often **hosts the planner** (K2 + fallbacks) so API keys stay off thin clients. Binds to localhost or LAN.

### Robot adapter

Implementation that maps **validated SkillCall**s to the real stack: vendor SDK, serial, Python driver, etc. **Vendor-specific code** lives **behind** this boundary. Swapping mock vs real adapter should not change the HTTP contract or `Plan` schema.

### Mock adapter

Same **interface** as the robot adapter but **no hardware**: trace, logs, optional in-memory state. See **[Mock adapter ("fake arm")](#mock-adapter-fake-arm)**.

### Input adapter

**Different** from the robot adapter: normalizes **sensors** (microphone → text via STT, clap detector, keyboard) into **InputEvent**s. Used for triggers and demo inputs, not for moving joints.

### InputEvent

Normalized message: **`type`** (e.g. voice_text, clap), **`payload`**, **`timestamp`**. Lets trigger logic stay independent of which vendor library captured the sound.

### TriggerRule

Optional mapping from **InputEvent** patterns (or conditions) to a **plan template** or automation—when in scope for the demo.

### Planner

Component that turns **natural language** (plus the manifest, server-side) into **Plan JSON**—typically **K2** first, then **fallback** LLMs. Often **colocated** with the companion but **conceptually separate**: it produces plans; the companion **validates and executes** them.

### Execution trace

Ordered **log** of what happened during **execute**: each step (skill id, args, success/failure, timestamps). Feeds the **read-only block list** during/after motion so users see progress without a physics simulator.

## Core types (conceptual)

Summary table; full definitions in **[Key terms and components](#key-terms-and-components)** above.

| Concept | Role |
| :--- | :--- |
| **Manifest** | `Skill` list: `id`, typed params, bounds, `description` for model. |
| **Skill** | One manifest entry: named capability + limits. |
| **SkillCall** | `{ skill_id, arguments }` — validates against manifest. |
| **Plan** | Ordered `SkillCall`s; rendered as a **block list**—**read-only** for preview/trace (MVP), **editable** in stretch. |
| **InputEvent** | `{ type, payload, timestamp }`. |
| **TriggerRule** | Optional: event patterns → plan template. |

## Mock adapter ("fake arm")

This is a **contract twin**, not a physics model.

- **Purpose:** Unblock companion, UI, and planner work **without motors**; invalid plans are **rejected** and valid plans run through the **same** pipeline as production—only the last step differs (log vs hardware).
- **What it is:** A **second implementation** of the robot adapter: for each validated `SkillCall`, **append to an execution trace**, optionally **sleep**, optionally update **in-memory fake joint state** for tests—**no** serial/USB. Uses the same **`POST /execute`** body as the real arm (set **`"dry_run": true`** per § JSON contracts).
- **What it is not:** Not a required **physics / RL simulation** of the Adeept; optional simple state exists only to support tests or demos.
- **Shared with the real adapter:** The **same manifest**, **validator**, and **bounds**—the mock does **not** replace validation; it executes what already passed validation.

## Non-negotiable rules

1. **Validate before execute** on the companion (defense in depth even if the client also validates).  
2. **Motor commands** come only from **validated `Plan` JSON**, not from free-form model text. Reasoning and clarification are **UX**; execution ignores them unless they produced a valid plan.  
3. **Default UI** does not expose raw **manifest** or internal **skill IDs**; use **humanized labels** or a deliberate “advanced” view.  
4. **Manifest is authored** with the adapter; full manifest passed to models **server-side** only.  
5. **Isolate vendor code** behind the adapter (subprocess or module boundary).  
6. **Safety:** bounds in manifest; executor enforces; document estop.

## Companion service responsibilities

- Host **manifest** for the connected robot (path from **`MANIFEST_PATH`**).  
- **`POST /plan`**: run planner; validate any returned **`plan`** before responding (or return validation errors only).  
- **`POST /execute`**: body per § JSON contracts; **always** run **`validate_plan`** before calling adapter.  
- **`POST /execute/fallback`**: load **`FALLBACK_PLAN_PATH`** when requested.  
- **`GET /health`**: liveness.  
- **Never** expose unauthenticated execution to the public internet; bind to LAN or require token if needed.

## MVP client (browser / desktop) responsibilities

- Capture NL: **text input** and optionally **browser Web Speech API** (feature-detect; fallback to typing).  
- Call **companion** `/plan` (not browser-direct to K2) so keys and manifest stay server-side.  
- Render **reasoning** text (stream or block) and **clarification** prompts (buttons or short reply field); **never** show raw manifest in default layout.  
- After a validated **plan** is shown, user confirms → **execute**. **Preview and execution trace** use the **same block-list component** as stretch editing (`readOnly` / no reorder handles); stretch flips on edit affordances without changing the underlying `Plan` model.

## Stretch: native mobile app responsibilities

- Same contract as MVP client: NL in → plan → execute.  
- **On-device STT** → transcribed text to companion.  
- Resolve companion **base URL** on LAN (manual IP, mDNS, last-used).

## Robot integration (Adeept)

- Adapter maps `SkillCall` → hardware commands the team implements (existing Python/SDK/serial).  
- Document joint/workspace limits in manifest and in runbook.

## Planner (K2 primary + fallbacks)

**Normative implementation steps:** [§ Planner integration (concrete)](#planner-integration-concrete). **Request/response JSON:** [§ JSON contracts](#json-contracts-normative-shapes).

**Model routing**

- Call **K2** first for each planning step that needs an LLM (clarification, reasoning, structured plan).  
- On **error, timeout, or empty response**, retry with **fallback model list** (e.g. another hosted API) per **config order**; log which model succeeded for debugging.  
- If **all** providers fail, use **`POST /execute/fallback`** with **baked `Plan` JSON** (judge path).

**Clarification (before final plan)**

- When confidence is low or user intent is ambiguous, return a **clarification object** (e.g. `{ "needs_clarification": true, "questions": [...] }` ) with **user-facing strings only**—no raw skill IDs.  
- User answers are sent back in the **same session**; then generate the final **`Plan`**.

**Reasoning (during planning)**

- Emit **explanation text** for the UI: considerations, alternatives, safety notes—in **natural language**.  
- Implement as **SSE/WebSocket** stream, **NDJSON**, or **single structured field** `reasoning_trace` on `POST /plan` response; pick one per Phase E.  
- Reasoning must **not** be parsed as executable code; only **`Plan` JSON** after validation runs the arm.

**Structured output**

- Input to planner includes **full manifest** (server-side) + conversation + user text.  
- Output: **`Plan` JSON** matching schema; invalid → **repair pass** (same or fallback model with schema error) or fail safe.  
- Presets/macros in manifest for ambiguous verbs when clarification is skipped for time.

## Implementation phases (aligned with PM milestones)

Phases **A–B** ≈ **Milestone 1**; **C** ≈ **Milestone 2**; **D** ≈ **Milestone 3**; **E** ≈ **Milestone 4**; **F** ≈ **Milestone 5**; **G** ≈ **Milestone 6 (stretch)**.

### Phase A — Schemas and validation

- Implement Pydantic models matching **[§ JSON contracts](#json-contracts-normative-shapes)**; optionally export JSON Schema from models for docs.
- **`validate.py`:** `validate_plan(manifest, plan) -> None` (raise with **`VALIDATION_ERROR`**) or return structured errors matching **`validation_errors`** shape.
- **Fixture files:** `examples/manifest.adeept.json`, `examples/plan.valid.json`, `examples/plan.invalid.json`, **`examples/plan.fallback.json`** (valid minimal plan for judge backup).

### Phase B — Mock companion

- **FastAPI** app on **`COMPANION_HOST`:`COMPANION_PORT`** (default **`8000`**); routes in **`routes/`** per **[§ Repository layout](#repository-layout-create-on-first-commit)**.
- Implement **`GET /health`**, **`POST /execute`** with body **`{ "plan", "dry_run" }`** per § JSON contracts; when **`dry_run`** is true or **`ADAPTER=mock`**, never touch serial/USB.
- Wire the **mock adapter** from **[Mock adapter ("fake arm")](#mock-adapter-fake-arm)**—contract-level stub only.
- **Exit:** `curl` invalid plan → **422** with **`VALIDATION_ERROR`**; valid plan → **200** + **`trace`** body.

### Phase C — Real adapter (Adeept)

- Replace mock with **`AdeeptAdapter`** (`companion/companion/adapters/adeept.py`) calling the real control path; keep **same** `POST /execute` contract.
- Manifest (`examples/manifest.adeept.json`, `manifest_id: adeept_5dof_v2`) lists only **implemented** skills; executor enforces **timeouts** between steps.
- **Runbook** in repo: see [README → Hardware bring-up](../README.md#hardware-bring-up-adeept-ada031-5-dof) for CH340 driver, firmware flash, port discovery, power-on order, and smoke test.
- **Exit:** script-sent plan moves arm; disconnect handled safely.

#### Wire protocol (vendor firmware `block_py.ino`)

- USB-serial @ **115200 baud**, line-delimited ASCII.
- Each command is one JSON line: `{"start":["<cmd>", arg1, arg2, ...]}\n`.
- Firmware buffer is `char line[60]` → adapter MUST refuse any line **> 59 bytes** (excluding the trailing `\n`).
- Numeric args are read as `long`; the adapter sends `int(round(angle))` only — never floats.
- Arduino auto-resets when the host opens the serial port (DTR toggle). Sequence on init: `serial.Serial(...)` → `time.sleep(ADEEPT_OPEN_RESET_S)` (default `2.0`) → `reset_input_buffer()` → bounded handshake retry (`{"start":["setup"]}` until firmware echoes anything, or `ADEEPT_HANDSHAKE_TIMEOUT_S` elapses).

#### Pin map and joint ranges

| Servo idx | Joint | Arduino pin | Range (deg) | Home |
| :--- | :--- | :--- | :--- | :--- |
| 0 | base yaw | 9 | 0–180 | 90 |
| 1 | shoulder | 6 | 0–180 | 90 |
| 2 | elbow | 5 | 0–180 | 90 |
| 3 | wrist | 3 | 0–180 | 90 |
| 4 | gripper | 11 | **30–100** (clamped) | 65 |

These are hardware constants — kept inside `adeept.py` as `PIN_MAP`, `JOINT_RANGES`, `HOME_ANGLES`. Do **not** move them to settings.

#### Skill → serial mapping

| Skill (manifest id) | Adapter behaviour | Serial commands |
| :--- | :--- | :--- |
| `go_home` | `_move_to(HOME_ANGLES)` | `servo_write(i, HOME_ANGLES[i])` per changed joint, interpolated at `ADEEPT_INTERP_HZ` |
| `set_joint_angle` | clamp to per-joint range, `_move_to` | `servo_write(i, angle)` |
| `pan_left` / `pan_right` | adjust `cur[0]` ± `degrees`, `_move_to` | `servo_write(0, ...)` per tick |
| `tilt_up` / `tilt_down` | adjust `cur[1]` ∓ `degrees`, `_move_to` | `servo_write(1, ...)` per tick |
| `grip_open` | `cur[4] = 100`, `_move_to` | `servo_write(4, 100)` |
| `grip_close` | `cur[4] = round(65 − (force_pct − 10) · 35/90)` | `servo_write(4, ...)` |
| `wave` | for each repetition, alternate shoulder 70 ↔ 110, then home | series of `servo_write(1, ...)` |
| `oled_text` | lazy-init OLED (`OLED_init`, `OLED_Ts(2)`) once; truncate text to 20 chars | `OLED_Clear`, `OLED_Cursor(0,0)`, `OLED_Show("...")` |

Truncation in `oled_text` is a **backstop** — the validator does not currently enforce JSON-Schema `maxLength`, so the adapter must defend.

#### Threading and lifecycle

- `/execute` runs the adapter inside FastAPI's threadpool while `BindingDispatcher` calls it via `asyncio.to_thread`. Serial is **not** thread-safe → every `_send` and `_handshake` write is wrapped in `self._lock = threading.Lock()`.
- `execute_skill_call` MUST NOT raise (Protocol contract in `adapters/base.py`). The implementation wraps `_dispatch` in a single try/except → `StepResult(status="failed", detail=str(exc))`.
- `close()` is called from `main.py` lifespan shutdown; it acquires the lock and closes the port if open.

#### Configuration

| Var | Default | Purpose |
| :--- | :--- | :--- |
| `ADEEPT_PORT` | *(unset)* | Serial device. Required when `ADAPTER=adeept`; missing → adapter raises, factory falls back to mock with a warning log. |
| `ADEEPT_BAUD` | `115200` | Matches firmware. |
| `ADEEPT_INTERP_HZ` | `50` | Sub-step rate for `_move_to`. |
| `ADEEPT_MAX_SPEED_DEG_S` | `60.0` | Per-joint angular speed cap. |
| `ADEEPT_OPEN_RESET_S` | `2.0` | Sleep after `Serial.open()` for MCU bootloader. |
| `ADEEPT_HANDSHAKE_TIMEOUT_S` | `8.0` | Bound on the `setup` retry loop. |

### Phase D — Browser client

- **Vite + TypeScript** under **`web/`**; read **`VITE_COMPANION_URL`** (e.g. `http://127.0.0.1:8000`) from **`.env`**.
- UI: text field, **Plan** → **`POST /plan`**, show **`reasoning`** + read-only **block list** from **`plan.steps`**; **Execute** → **`POST /execute`** with **`{ "plan", "dry_run": false }`**.
- **Shortcut until Phase E:** load **`examples/plan.valid.json`** or call **`POST /execute`** directly for canned motion.
- **Exit:** full path without terminal; block list uses **`display_name`** from manifest for labels (map **`skill_id`** → manifest lookup).

### Phase E — Planner on companion (K2 + fallbacks + clarification + reasoning)

- Implement **`POST /plan`** per **[§ JSON contracts](#json-contracts-normative-shapes)** and **[§ Planner integration (concrete)](#planner-integration-concrete)**; env vars per **[§ Environment variables](#environment-variables)**.
- Wire **`POST /execute/fallback`** and **`FALLBACK_PLAN_PATH`** for judge backup.
- **Optional:** SSE for reasoning only—defer if time-constrained; non-streaming **`reasoning`** string is enough for MVP.
- **Exit:** three NL flows; manifest never violated; default UI shows **`display_name`**, not raw **`skill_id`**, unless “advanced” mode.

### Phase F — Inputs and demo polish

- Optional **`InputEvent`** stream and **clap** → trigger template (if in scope).
- UI: loading/error states; **demo script** in `docs/` or repo root.
- **Exit:** rehearsed checklist satisfied (see PM Milestone 5).

### Phase G — *(Stretch)* Native mobile

- Same endpoints as Phase D/E; **on-device STT** → send **text** only to companion.
- **Exit:** one device, one successful spoken→execute path.

## HTTP routes (summary)

Normative bodies and examples: **[§ JSON contracts](#json-contracts-normative-shapes)**. **Base URL:** `http://<host>:<port>` (default port **`8000`**).

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/health` | Liveness + `manifest_id` + `adapter` |
| `POST` | `/plan` | NL → reasoning + optional clarification + `plan` |
| `POST` | `/execute` | Body `{ "plan", "dry_run" }` — validate then run adapter |
| `POST` | `/execute/fallback` | Body `{ "use_fallback_file": true }` — load `FALLBACK_PLAN_PATH` |
| `GET` | `/plan/stream` | *(Optional stretch)* SSE tokens for `reasoning` only |

**Removed as separate route:** **`POST /execute/dry-run`** — use **`POST /execute`** with **`"dry_run": true`** (see JSON contracts).

## Glossary

Short index; see **[Key terms and components](#key-terms-and-components)** for full definitions.

| Term | Definition |
| :--- | :--- |
| **Capability manifest** | Authored list of skills, params, bounds, descriptions for one robot integration. |
| **Skill** | One manifest entry: a named capability with typed parameters and limits. |
| **SkillCall** | Single `{ skill_id, arguments }`; must match manifest. |
| **Plan** | Ordered SkillCalls from planner; validated before execute; maps to block list UI. |
| **Validator** | Code that rejects invalid Plan JSON and out-of-bounds SkillCalls using manifest. |
| **Companion** | Laptop service: API, manifest, validation, execute routing, often planner. |
| **Robot adapter** | Maps validated SkillCalls to hardware/SDK; vendor code behind this. |
| **Mock adapter** | Contract-level "fake arm": trace/logs only; same execute path as real adapter. |
| **Input adapter** | Sensors → InputEvent; not for joint control. |
| **InputEvent** | Normalized `{ type, payload, timestamp }` from inputs. |
| **TriggerRule** | Optional: event patterns → plan or template. |
| **Planner** | NL + manifest → Plan JSON (K2 + fallbacks); often on companion. |
| **Execution trace** | Step-by-step log during execute; UI preview of motion progress. |

## Repository expectations

On Phase A completion, the repo **must** contain:

- **`companion/`** package runnable via **`uvicorn companion.main:app --reload --host 0.0.0.0 --port 8000`** (or equivalent).
- **`examples/*.json`** per Phase A fixture list.
- **`web/`** static or Vite build instructions in **`README.md`** (root): how to set **`VITE_COMPANION_URL`** and run **`npm run dev`**.
- **`.env.example`** listing all variables from **[§ Environment variables](#environment-variables)** with empty values.

---

*Capability-manifest platform; **browser MVP** + LAN companion; **K2-primary planner** + hosted fallbacks + offline plan; **clarification + reasoning UX**; **mobile STT stretch**.*
