# Quoridor robot demo: onboarding, 3-owner split, and contracts

This document is the **primary onboarding spec** for **human developers** and **AI coding agents** working on the Quoridor physical demo (webcam, Adeept 5 DOF arm, external Quoridor engine, K2 for narration/coach). It complements product context in [quoridor-demo-feasibility-and-framework.md](quoridor-demo-feasibility-and-framework.md).

**Goal:** three people can work in parallel with **minimal merge conflicts**, and any agent can implement code that **plugs together** via stable **contracts** and **protocols**.

**Agents:** read **[docs/AGENTS.md](AGENTS.md)** first; it duplicates the mandatory **ask-before-build** rules and points here for depth.

---

## 0. Project context (agents must read)

### 0.1 What exists at integration time

- **Physical:** commercial Quoridor board; optional tape/velcro on pawns; **printed fiducial markers in four corners** (outside the 9×9) for homography.
- **Sensors:** **one** webcam, fixed mount; top-down or steep angle.
- **Actuation:** **Adeept 5 DOF** arm + gripper; communication typically **serial** to Arduino/controller (exact stack owned by **Owner 3**).
- **Brain:** external **Quoridor engine** (legal moves + best move); **K2** explains bot moves and optionally **coaches** humans (engine-backed comparison)—see feasibility doc §4.1, §5.7.
- **Coach mode:** **add-on**, default **off** (`coaching_enabled: false`).

### 0.2 Non-goals for agents (avoid scope creep)

- Replacing the engine with an LLM for move choice.
- Generating unrestricted Arduino each turn; motion is **skill-based** (`RobotJob`).
- Perfect play; “strong + legal + demo-stable” is enough.

### 0.3 Tech assumptions (unless the team changes them)

- **Language:** Python **3.11+** for orchestration, vision glue, engine wrapper, K2 client.
- **Monorepo** with **multiple packages** (editable installs or uv/poetry workspace—**Owner 3** sets this up when scaffolding).
- **Tests:** `pytest`; **fakes** required so CI runs **without** camera, arm, or K2 network.

### 0.4 Interaction protocol for AI agents (mandatory)

Agents must **not** begin implementing until they have **explicitly** aligned with the human. This reduces wrong-owner edits, scope creep, and merge conflicts.

**At the start of every coding session:**

1. **Ask which Owner (subsystem) applies** if not already stated:  
   *“Are we working on **Owner 1** (contracts + vision + markers), **Owner 2** (engine + K2), or **Owner 3** (arm + orchestrator + CLI)? Or docs-only / cross-cutting integration?”*

2. **Confirm intent before writing code**—ask until clear:
   - **Deliverable:** scaffold, single feature, tests-only, bugfix, or documentation?
   - **Paths:** which directories may change? (Stay within §1 unless the human approves a contract/integration PR.)
   - **Dependencies:** can this change `contracts/`? Does it assume **G0** merged?
   - **Runtime:** fake-only / no serial / no K2 network?

3. **If the request is vague** (“add vision”, “wire the arm”), **stop** and ask **1–2 targeted questions** (e.g. “homography only, or full `GameState` from board?”) instead of choosing defaults.

4. **After confirmation**, **restate** the plan in one sentence (Owner, paths, outcome), then implement.

5. **Mid-session:** if the human’s new message could change scope (e.g. “also add coach”), **pause** and confirm whether that expands the same task or is follow-up work.

This protocol is mirrored at the top of **[docs/AGENTS.md](AGENTS.md)** so it is hard to miss.

---

## 1. Three human owners (packages and authority)

Ownership is **by directory**. Each owner merges PRs that touch **only** their trees, except **contract bumps** (see §1.4).

| Owner | Title | Owns (paths) | Primary responsibility |
| ----- | ----- | ------------ | ---------------------- |
| **1** | **Perception & world model** | `contracts/`, `vision/`, `assets/markers/` | Shared **types**, webcam → **VisionPacket** / **GameState** (when confident), ArUco/AprilTag corner pipeline, printable marker assets |
| **2** | **Game engine & language** | `engine_adapter/`, `llm_k2/` | **EnginePort**, real engine **wrapper**, **FakeEngine**, K2 HTTP client, bot explainer + coach prompts, **FakeLlm** |
| **3** | **Embodied integration** | `orchestrator/`, `arm_driver/`, `apps/demo_cli/` | **ArmPort**, serial/hardware, **pipeline_bot** / optional **pipeline_coach**, **move_from_diff**, **job_builder**, thin CLI, end-to-end wiring |

### 1.1 Why this split minimizes conflicts

- **Owner 1** never edits Arduino or K2 prompts.
- **Owner 2** never edits OpenCV homography or serial drivers.
- **Owner 3** is the **only** layer that imports **all** packages; adapters **do not** import `orchestrator`.

### 1.2 Agent session assignment

When spawning agents, the human should **pin Owner and paths** in the prompt. If they do not, the agent **must ask** per §0.4. Cross-package edits in one session increase conflict risk—only do so when the human explicitly requests an **integration** task and confirms which packages may change.

### 1.3 Contract changes (special case)

- **`contracts/`** is **owned by Owner 1** but **GameState** / **EngineMove** / **Wall** notation must stay **compatible** with the real engine.
- **Rule:** any PR that changes `contracts/messages.py` (or equivalent) requires **Owner 2 approval** (engine mapping) before merge, and **Owner 3** notified (orchestrator/job_builder).

### 1.4 Mapping old 7-way split → 3 owners

| Former WS | Now |
| --------- | --- |
| WS-A Contracts + WS-C Vision | **Owner 1** |
| WS-B Engine + WS-E LLM | **Owner 2** |
| WS-D Arm + WS-F Orchestrator + WS-G CLI | **Owner 3** |

---

## 2. Dependency rule (strict — agents must follow)

Allowed import direction:

```text
contracts
  ↑
engine_adapter   vision   arm_driver   llm_k2
  ↑___________________|___________________|
                    orchestrator
                         ↑
                    apps/demo_cli
```

- **`contracts`** has **no** internal package dependencies (only stdlib / pydantic / typing).
- **`orchestrator`** may import all four adapters + `contracts`.
- **`engine_adapter`**, **`vision`**, **`arm_driver`**, **`llm_k2`** import **`contracts`** only—not each other, not **`orchestrator`**.

Violations will cause circular imports and merge pain; **reject in review**.

---

## 3. Repository layout (reference tree)

```text
<repo>/
  docs/
    AGENTS.md
    quoridor-demo-feasibility-and-framework.md
    quoridor-workstreams-and-contracts.md
  contracts/
    README.md
    messages.py
    version.py
  engine_adapter/
    src/quoridor_engine_adapter/
      protocol.py
      wrapper.py
      fake_engine.py
      tests/
  vision/
    src/quoridor_vision/
      markers.py
      homography.py
      state_from_board.py
      fake_vision.py
      tests/
  arm_driver/
    src/quoridor_arm/
      protocol.py
      serial_backend.py
      fake_arm.py
      tests/
  llm_k2/
    src/quoridor_llm/
      client.py
      prompts/
      fake_llm.py
      tests/
  orchestrator/
    src/quoridor_orchestrator/
      session.py
      pipeline_bot.py
      pipeline_coach.py
      move_from_diff.py
      job_builder.py
      config.py
      tests/
  apps/demo_cli/
    main.py
  assets/markers/
    README.md
```

**Scaffolding note:** Until packages exist, **Owner 3** may add a root `pyproject.toml` workspace; agents should not duplicate package roots without human confirmation (§0.4).

---

## 4. Stable contracts and protocols (implement exactly)

### 4.1 Core message types (`contracts/` — Owner 1)

Document field meanings in **`contracts/README.md`** (especially **Wall** anchor vs engine).

- **GameState:** `pawns` (P1/P2 → cell id), `walls: Wall[]`, `walls_remaining`, `side_to_move`, `phase`, `winner`.
- **Wall:** `{ anchor_square: str, orientation: "h" | "v" }` — **one** convention, shared with Owner 2’s engine adapter.
- **VisionPacket:** `game_state` (nullable if unsure), `confidence` ∈ [0,1], `stable`, `frame_id`, `homography_ok`.
- **EngineMove:** `MovePawn` | `PlaceWall` (discriminated).
- **RobotJob:** `kind`, cells, wall fields, `speed` enum — enough for Owner 3’s motion skills.
- **CoachEvent:** (add-on) `state_before`, `state_after`, `inferred_move`, `moving_player`, `engine_best`, optional `engine_top_k`, `vision_confidence`.

**Versioning:** `contracts/version.py` exports `CONTRACT_VERSION`. Orchestrator logs a warning if mismatched with config.

### 4.2 `EnginePort` (Owner 2)

```python
class EnginePort(Protocol):
    def legal_moves(self, state: GameState) -> list[EngineMove]: ...
    def best_move(self, state: GameState) -> EngineMove: ...
    def optional_top_k(self, state: GameState, k: int) -> list[tuple[EngineMove, float]]: ...
```

Coach compares **human inferred move** to **best_move** / **optional_top_k** from **state_before**.

### 4.3 `VisionPort` (Owner 1)

```python
class VisionPort(Protocol):
    def process_frame(self, bgr_image: ndarray) -> VisionPacket: ...
```

### 4.4 `ArmPort` (Owner 3)

```python
class ArmPort(Protocol):
    def home(self) -> None: ...
    def execute(self, job: RobotJob) -> ArmResult: ...
```

### 4.5 `LlmPort` (Owner 2)

```python
class LlmPort(Protocol):
    def explain_bot_move(self, payload: BotExplainPayload) -> str: ...
    def coach_move(self, event: CoachEvent) -> CoachFeedback: ...
```

Payload types can live in **`llm_k2/schemas.py`** but **field names** must map 1:1 from **`contracts`** (no duplicate domain models).

---

## 5. Corner markers (Owner 1 — full spec)

| Item | Spec |
| ---- | ---- |
| **Tech** | ArUco (OpenCV) **or** AprilTag — **one** dictionary project-wide |
| **Placement** | **Four corners**, **outside** the 9×9 grid (frame or table sheet) |
| **IDs** | Fixed TL/TR/BR/BL → numeric IDs; document in **`assets/markers/README.md`** |
| **Print** | Matte paper, **~4–6 cm** marker side (validate at demo resolution) |
| **Failure** | `VisionPacket.homography_ok = false` if reprojection error > threshold |

Owners **2 and 3** must **not** embed marker IDs in engine or arm code—only consume **VisionPacket**.

---

## 6. Orchestrator (Owner 3) — modes and config

Example **`config.yaml`**:

```yaml
mode: bot_vs_human
coaching_enabled: false
coached_player: P1
verbosity: low
contract_version: "0.1.0"
```

- **pipeline_bot:** vision → validate state → `best_move` → `job_builder` → `ArmPort` → async `explain_bot_move`.
- **pipeline_coach:** if `coaching_enabled`, after stable human move: `move_from_diff` → validate → engine compare → `coach_move`.

**Owner 3** owns **`job_builder.py`** (**EngineMove** → **RobotJob**). The **`arm_driver`** executes **RobotJob** primitives only—no second mapping layer in that package.

---

## 7. Integration gates (merge order — all agents)

| Gate | Owner lead | Deliverable |
| ---- | ---------- | ----------- |
| **G0** | **1** | `contracts/` v0.1 + README + `CONTRACT_VERSION` |
| **G1** | **2** | `FakeEngine` + tests (no vision) |
| **G2** | **1** | Homography + `FakeVision` from stills or JSON trace |
| **G3** | **3** | `move_from_diff` + tests using **fakes** only |
| **G4** | **3** | `FakeArm` + `job_builder` + unit tests |
| **G5** | **2** | `FakeLlm` + orchestrator hook for bot explanation |
| **G6** | **2+3** | Coach prompt + `pipeline_coach` (optional) |
| **G7** | **3** | `demo_cli` dry run (fakes → then hardware) |

**Parallelism after G0:** **1** and **2** can proceed simultaneously on vision vs engine+llm; **3** starts heavy work after **G1** (fake engine) for orchestrator unit tests, or uses **only** `FakeEngine` from **2**’s package.

---

## 8. Fake stack (required for CI and agent testing)

| Package | Fake | Behavior |
| ------- | ---- | -------- |
| `engine_adapter` | `FakeEngine` | Deterministic `best_move` for tiny states |
| `vision` | `FakeVision` | Scripted `GameState` sequence |
| `arm_driver` | `FakeArm` | Records `RobotJob` list |
| `llm_k2` | `FakeLlm` | Fixed strings |

**Owner 3**’s orchestrator tests should run **all fakes**, **no I/O**.

---

## 9. Merge hotspots and rules (agents: avoid these mistakes)

| Risk | Rule |
| ---- | ---- |
| Duplicate types | Import **`contracts`** only |
| `utils.py` soup | Package-local helpers only |
| Adapters importing orchestrator | **Forbidden** |
| Huge `main.py` | **`apps/demo_cli/main.py`** stays thin (Owner **3**) |
| Silent contract edits | Owner **2** reviews **`contracts`** PRs that touch engine-facing types |

---

## 10. PR checklist (any contributor or agent)

- Dependency rule (§2) satisfied
- Tests pass with **fakes** where applicable
- `CONTRACT_VERSION` bumped only with Owner **2** sign-off on type changes
- Coach paths behind `coaching_enabled` (default off)
- No new cross-package imports outside §2
- **Human confirmed Owner + intent** for this change (per §0.4)

---

## 11. Quick task prompts (copy-paste for agents)

**Before using these prompts, complete §0.4** (ask Owner, confirm intent, restate plan).

**Owner 1 agent:** “Implement `contracts/messages.py` per §4.1 and `VisionPort` + `FakeVision` per §8. Do not import engine or arm. Add `assets/markers/README.md` per §5.”

**Owner 2 agent:** “Implement `EnginePort` + `FakeEngine` using the team’s external engine behind `wrapper.py`. Implement `LlmPort` with `FakeLlm` and placeholder HTTP for K2. Do not import `orchestrator` or `vision`.”

**Owner 3 agent:** “Implement `ArmPort` + `FakeArm`, `move_from_diff`, `job_builder`, `pipeline_bot` with injected ports, `demo_cli/main.py`. Import `contracts` and adapter packages; do not implement OpenCV or engine internals.”

---

## 12. Summary

- **Three human owners** map to **three subtrees**: **(1) contracts + vision + markers**, **(2) engine + K2**, **(3) arm + orchestrator + CLI**.
- **Contracts first (G0)**; then parallel **perception** and **engine/LLM**; **integration** follows gates §7.
- **AI agents** must **ask which Owner / subsystem** and **confirm intent before building** (§0.4, **[docs/AGENTS.md](AGENTS.md)**), stay package-scoped, obey §2, use **fakes**, and read the feasibility doc for product context.
