# Engineering build spec (for implementers and coding agents)

Technical source of truth for architecture and contracts unless superseded by checked-in schemas and code.

## Platform decisions (locked for this project)

| Topic | Decision |
| :--- | :--- |
| **Robot** | **Adeept 5 DOF** — reference hardware for manifest + adapter. |
| **Client (MVP)** | **Laptop + browser** (or minimal desktop UI): **typed NL** and/or **Web Speech API** / desktop mic. Primary integration target until the pipeline is stable. |
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
- Preview via **trace / dry-run**; no mandatory sim.

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

## Core types (conceptual)

| Concept | Role |
| :--- | :--- |
| **Manifest** | `Skill` list: `id`, typed params, bounds, `description` for model. |
| **SkillCall** | `{ skill_id, arguments }` — validates against manifest. |
| **Plan** | Ordered `SkillCall`s; rendered as a **block list**—**read-only** for preview/trace (MVP), **editable** in stretch. |
| **InputEvent** | `{ type, payload, timestamp }`. |
| **TriggerRule** | Optional: event patterns → plan template. |

## Non-negotiable rules

1. **Validate before execute** on the companion (defense in depth even if the client also validates).  
2. **Motor commands** come only from **validated `Plan` JSON**, not from free-form model text. Reasoning and clarification are **UX**; execution ignores them unless they produced a valid plan.  
3. **Default UI** does not expose raw **manifest** or internal **skill IDs**; use **humanized labels** or a deliberate “advanced” view.  
4. **Manifest is authored** with the adapter; full manifest passed to models **server-side** only.  
5. **Isolate vendor code** behind the adapter (subprocess or module boundary).  
6. **Safety:** bounds in manifest; executor enforces; document estop.

## Companion service responsibilities

- Host **manifest** for the connected robot.  
- **POST /plan/validate** (optional) or validate on **POST /execute**.  
- **POST /execute** with validated `Plan` or enqueue steps.  
- **Health** endpoint for client discovery on LAN.  
- **Never** expose unauthenticated execution to the open internet; bind to LAN or require token if needed.

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

- Check in **JSON Schema** (or Pydantic/OpenAPI) for manifest, `Plan`, `SkillCall`, `InputEvent`.
- **Validator** module: load manifest, validate `Plan` and each `SkillCall` arguments against bounds.
- **Fixture files:** `examples/manifest.adeept.json`, `examples/plan.valid.json`, `examples/plan.invalid.json` (expect reject).

### Phase B — Mock companion

- HTTP server (FastAPI/Flask/etc.) with **`GET /health`**, **`POST /execute`** accepting a `Plan` body (or **`POST /execute/dry-run`** that never touches hardware).
- **Mock adapter:** iterate `SkillCall`s, append to trace, configurable delay; no serial/USB.
- **Exit:** `curl` or script runs invalid plan → 4xx; valid plan → 200 + trace body.

### Phase C — Real adapter (Adeept)

- Replace mock with **adapter** calling real control path; keep **same** `POST /execute` contract.
- Manifest lists only **implemented** skills; executor enforces **timeouts** between steps.
- **Runbook** in repo: connection, estop, first smoke test command.
- **Exit:** script-sent plan moves arm; disconnect handled safely.

### Phase D — Browser client

- Static or SPA: **base URL** config, **text input**, **Execute**; **read-only block list** for plan preview and live trace (reuse component; `readOnly: true`).
- **Allowed shortcut:** hardcode or load **canned `Plan`** until Phase E; companion may expose **`POST /execute/canned?demo=1`** for judge backup only—remove or hide in prod if needed.
- **Exit:** no terminal required for one full execute path.

### Phase E — Planner on companion (K2 + fallbacks + clarification + reasoning)

- **Config:** `PLANNER_PRIMARY=k2` (or provider-specific id), `PLANNER_FALLBACKS=...` (ordered list), timeouts; **no secrets in repo**.
- **`POST /plan`** (or **`POST /plan/session`** with turns): body includes `user_text`, optional `session_id`, optional `clarification_replies`. Companion loads manifest **only on server**; calls **K2** first, then fallbacks on failure.
- **Response shape** (example): `{ "reasoning": "..." | stream token, "needs_clarification": bool, "questions": [...], "plan": Plan | null, "validation_errors": [...] }`. If `needs_clarification`, client shows questions; **next** request includes answers until `plan` is present and valid.
- **Streaming:** optional **`GET /plan/stream`** or **SSE** on same route for reasoning text only; plan still delivered as complete JSON when ready.
- **`POST /execute`** unchanged; flow: user confirms plan → execute (or auto-execute for hackathon).
- **`plans/fallback.json`** + **`POST /execute/fallback`** when **all** LLMs fail.
- **Exit:** three NL flows including at least one **clarification** or **streaming reasoning** path; manifest never violated; default UI does not show raw manifest.

### Phase F — Inputs and demo polish

- Optional **`InputEvent`** stream and **clap** → trigger template (if in scope).
- UI: loading/error states; **demo script** in `docs/` or repo root.
- **Exit:** rehearsed checklist satisfied (see PM Milestone 5).

### Phase G — *(Stretch)* Native mobile

- Same endpoints as Phase D/E; **on-device STT** → send **text** only to companion.
- **Exit:** one device, one successful spoken→execute path.

## API sketch (implementing teams adjust paths)

| Method | Purpose |
| :--- | :--- |
| `GET /health` | Liveness + optional manifest id/version |
| `POST /plan` | NL (+ optional session + clarification replies) → reasoning text, optional clarification questions, **`Plan`** when ready |
| `GET /plan/stream` or SSE | *(Optional)* Reasoning tokens only; plan still finalized as JSON |
| `POST /execute` | Body: validated `Plan` |
| `POST /execute/dry-run` | Optional: trace without hardware |
| `POST /execute/fallback` | Baked plan when **all** LLMs unavailable |

## Glossary

| Term | Definition |
| :--- | :--- |
| **Manifest** | Authoritative skills for one robot integration. |
| **Companion** | LAN service: validation + adapter + hardware. |
| **Plan** | Validated skill sequence. |

## Repository expectations

Schemas and example manifests live in-repo when Phase A lands.

---

*Capability-manifest platform; **browser MVP** + LAN companion; **K2-primary planner** + hosted fallbacks + offline plan; **clarification + reasoning UX**; **mobile STT stretch**.*
