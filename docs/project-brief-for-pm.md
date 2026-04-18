# Project brief (for project managers and stakeholders)

## Decided constraints (hackathon)

| Topic | Decision |
| :--- | :--- |
| **Hardware** | Live **Adeept 5 DOF** arm as the primary integration target. |
| **Client (MVP)** | **Laptop + browser** (or minimal desktop shell) on the **same machine as the companion** or another machine on the LAN: **typed NL** and/or **browser mic** for speech. Fastest path to prove arm + planner + execution. |
| **Client (stretch)** | **Native mobile app** on the same LAN as the companion, with **on-device STT** (OS APIs) sending **text** to planning—only if time allows after the laptop path works. |
| **Design stage** | **Always natural language first:** every new behavior or change starts from NL. |
| **MVP UX** | **Natural language only** for the core path. **Plan preview and execution trace** use the **same block-list UI** as the stretch editor, **read-only** (one block per skill call). **Stretch** turns on **editing** on that same surface (reorder / adjust parameters within bounds). |
| **Client ↔ robot** | **Companion service on a laptop** (or SBC) next to the arm: runs the adapter + small **HTTP/WebSocket API**. MVP clients use **localhost or LAN** (same Wi‑Fi, or **phone hotspot** to the laptop if the demo phone is only for connectivity). **Not** BLE or USB-from-phone as the primary motion path for this demo. |
| **STT (MVP)** | **Browser Web Speech API** and/or **typed text**; optional **desktop** STT—no requirement for a mobile build to ship the first demo. |
| **STT (stretch)** | **On-device** speech on iOS/Android when the native app exists. |
| **Planner models** | **K2 (sponsor) as primary** reasoning/planner backend; **other hosted models** as automatic fallback if K2 errors, rate-limits, or times out. **Offline:** rehearsed **cached `Plan` JSON** if all APIs fail. |
| **Planning UX** | **Clarify before acting:** model may ask **short, user-facing questions** in plain language when intent is ambiguous—**without** showing raw manifest, skill IDs, or schema to the user. **Reasoning visible:** show an **explanation stream** (what the assistant is considering / why) during planning; final execution still uses **validated** `Plan` JSON only. |

## One-sentence pitch

End users personalize **how** they control robots and **what** those interactions mean—starting in **natural language** every time, with optional **block-style refinement** of the skill-call list when scope allows—while the system only runs **capabilities the robot already exposes**, via a **manifest** and **adapter** model so new hardware can be onboarded without rebuilding the product.

## Problem

Programming robots is still the domain of specialists. Consumer and research robots often ship with **code or vendor SDKs**, not a consistent, end-user-friendly control surface. People want to say things like “when I clap, spin slowly” or “wave when I say hello,” but doing that safely usually means custom glue code per device and per scenario.

## Product idea

We provide a **connectivity and personalization layer**:

1. **Capability manifest** — Structured description of what this robot can do (named skills, parameters, safety bounds, descriptions for the planner). **Authored** by integrators, not read from the metal.

2. **Robot adapter** — Maps manifest skills to the real stack (SDK, serial, etc.). Lives **on the companion machine** next to the arm for this architecture.

3. **Companion service** — Listens on **localhost/LAN**; accepts **plan execution** and optionally **planning** (often colocated on the laptop so API keys stay off thin clients).

4. **Input adapters (demo-scoped)** — e.g. browser or desktop STT → text, clap detection. Normalized **events** for triggers.

5. **Intent and planning** — **K2-first** (with hosted fallbacks) turns NL goals into **plans** (ordered skill calls) that **validate** against the manifest. The **manifest stays server-side** for prompting; users see **plain-language** clarification and **step-by-step reasoning**, not raw capability lists unless you explicitly choose to show a simplified summary.

6. **User refinement** — **NL** first; **stretch:** enable **edit mode** on the plan block list (same component as preview).

7. **Preview / trace** — Show the validated plan and **live execution** as a **read-only block list** (one block per `SkillCall`)—the **same interface** as stretch block editing, **without** drag/edit affordances. No RL “digital twin” required in v1.

## Why this connectivity shape

- Adeept-class arms are typically controlled from a **full computer** (Python, serial). A **phone alone** is the wrong place for real-time motor control and driver glue.
- **Laptop + browser first** minimizes moving parts: one network hop, no app store or native toolchain on the critical path.
- **LAN + companion** stays stable under demo conditions if you use a **hotspot** you control.
- **Stretch mobile + on-device STT** matches the long-term product story once the pipeline is boringly reliable.
- **API LLM** keeps JSON/schema quality high; **fallback plan** saves the demo when Wi‑Fi flakes.

## Differentiator

**Ease of onboarding new robots** via manifest + adapter; **NL-first** personalization; **flexible inputs** within a capability-grounded contract.

## Out of scope (for credibility)

- Inventing grasps the hardware cannot perform.
- Guaranteed one true mapping for vague verbs without presets or clarification.
- RL-grade simulation for every device in v1.

## User journey (illustrative)

**MVP (laptop path)**  
1. Integrator ships **manifest + adapter** on the companion (Adeept 5 DOF).  
2. User types or uses **browser mic** in a **web UI** (or minimal desktop client); text goes to **planning** (API LLM or companion-proxied).  
3. **Validated plan** shown as **read-only blocks**; user triggers **execute**; **execution progress** on the same block list; arm moves.  
4. User iterates in **NL**.

**Stretch (mobile + edit)**  
Same flow in a **native app** with **on-device STT** → text; **optional edit mode** on the same block list used for preview/trace.

## Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| LLM invents skills | Schema validation; allowlisted skill names |
| Unsafe motion | Manifest bounds; rate limits; estop story |
| Network during demo | Hotspot + cached fallback plan |
| Wrong LAN | Document IP discovery or fixed mDNS name |

## Suggested workstreams

| Stream | Focus |
| :--- | :--- |
| Contracts & validation | Manifest schema, plan format, events |
| Companion + robot | Adapter, HTTP API, Adeept bring-up, safety |
| Web / desktop client (MVP) | Browser or simple shell: NL in, trace, execute |
| Mobile (stretch) | Native app, on-device STT, LAN to companion |
| Inputs | Clap, event normalization |
| Intelligence | Planner prompts, presets, fallback JSON |

## Milestones (detailed)

Use these as **definition of done** for status reviews. Order matters: later milestones assume earlier **exit criteria** are met.

---

### Milestone 1 — Contracts and mock execution

**Objective:** Everyone agrees on data shapes; software can validate plans and simulate execution without hardware risk.

| Item | Detail |
| :--- | :--- |
| **Deliverables** | Versioned **JSON Schema** (or equivalent) for **manifest**, **`Plan`**, **`SkillCall`**, **`InputEvent`**; **validator** in code; **one example manifest** for the Adeept (even if skills are stubs); **mock robot adapter** that logs or prints “would execute” per step. |
| **Companion** | Process runs locally; exposes at least **health** + **execute** (or **dry-run execute**) against the mock adapter; binds to `127.0.0.1` or LAN as chosen. |
| **Exit criteria** | Invalid `Plan` JSON is **rejected** with a clear error; valid plan runs through mock adapter **end-to-end** from a manual script or `curl`. No arm required. |
| **Depends on** | Nothing. |

**Note:** The “mock arm” is **software** that walks through the **same validated skill calls** the real adapter will execute—**same rules, no motors**—not a physics or 3D simulation of the arm unless you add that separately. It is a **contract-level** stub so the team can test the pipeline safely. Details: [build-spec.md — Mock adapter ("fake arm")](build-spec.md#mock-adapter-fake-arm).

---

### Milestone 2 — Real robot adapter and smoke test

**Objective:** The same companion contract drives the **real Adeept 5 DOF** through a thin, bounded adapter.

| Item | Detail |
| :--- | :--- |
| **Deliverables** | **Robot adapter** implementation (SDK/serial/Python as per hardware); **minimal skill set** (e.g. home, per-joint moves or safe poses—exact list is a team decision); **manifest** updated to match reality; **runbook**: serial/USB, permissions, known-good pose. |
| **Safety** | Documented **joint/workspace limits** in manifest; **rate limits** or max step size; **physical estop** or “kill switch” procedure written down; **one person** named for supervised tests. |
| **Exit criteria** | From a **CLI or script** (not necessarily the browser), a **validated** `Plan` of allowed skills executes on hardware without manual intervention mid-sequence; **failure modes** (disconnect, timeout) don’t leave motors in an undefined state. |
| **Depends on** | Milestone 1. |

---

### Milestone 3 — Browser client → companion → execute (LAN / localhost)

**Objective:** Non-developers can see the **full loop** from intent to motion using the **MVP UI**, with planning still **optional or canned** if Milestone 4 is not done yet.

| Item | Detail |
| :--- | :--- |
| **Deliverables** | **Web UI** (or minimal desktop shell): text field for NL; **Execute** (and **Plan preview**) buttons; calls companion **HTTP/WebSocket** on documented host/port; **read-only block list** for plan preview and **execution trace** (same component as future editor, no edit affordances—even if plan is canned at first). |
| **Planning placeholder** | Acceptable to use a **canned `Plan` JSON** or a single “demo plan” button until Milestone 4; document that clearly so scope doesn’t slip. |
| **Networking** | Document how a second machine on the **same LAN** reaches the companion (IP, firewall, optional mDNS). Rehearse **hotspot** if venue Wi‑Fi is unreliable. |
| **Exit criteria** | A **judge-ready path**: open UI → trigger execution → arm moves **or** dry-run logs match the expected sequence **without** opening a terminal on stage. |
| **Depends on** | Milestones 1–2. |

---

### Milestone 4 — Planner (K2 + fallbacks), clarification, reasoning UI, validation

**Objective:** User **natural language** becomes a **validated `Plan`** via **K2 as primary**, other **hosted models on fallback**, with **clarification** when needed and **visible reasoning**—same safety rules as scripted plans.

| Item | Detail |
| :--- | :--- |
| **Deliverables** | **Planner** service on **companion**: loads full **manifest** for prompting only (never dump raw JSON to end users by default). Calls **K2** first for (a) optional **clarification** turn(s) in **plain language**, (b) **reasoning / narration** for the UI, (c) **structured `Plan` JSON** (or separate calls per sub-step if simpler). On K2 failure, **retry with configured fallback model(s)** before giving up. **Validator** always runs server-side before execute. |
| **Clarification (user-safe)** | If the user says something ambiguous (“wave”), the system may respond with **one or two short questions** or **labeled choices** (e.g. “Gentle greeting vs big gesture?”)—**not** internal skill names or manifest excerpts unless you deliberately add an **advanced** panel. |
| **Reasoning UX** | UI shows **streaming or chunked text**: what the assistant is **considering**, constraints, and tradeoffs **in natural language** (sponsor-visible). This is **not** a substitute for validation: only the **validated `Plan`** drives motors. |
| **UI** | Shows **reasoning stream**, then **final plan** (skill calls or humanized labels) and **validation errors** in plain language. |
| **Fallback chain** | Order: **K2 → other hosted models → cached `Plan` JSON** route for judge backup. Document provider order in config. |
| **Exit criteria** | Three **different** NL flows (including at least one that **uses clarification** or **shows multi-step reasoning**) produce **valid plans** or graceful “cannot do”; **no** execution of skills not in the manifest; **no** requirement for users to see raw manifest. |
| **Depends on** | Milestones 1–3 (M3 can be canned-plan until this lands). |

---

### Milestone 5 — Demo hardening and rehearsal

**Objective:** Predictable **10-minute judge story** and resilience to **network and hardware** surprises.

| Item | Detail |
| :--- | :--- |
| **Deliverables** | **Written demo script** (steps, what to say, what should happen); **fallback path** rehearsed (LLM down → still show motion or dry-run); **optional** clap or second input modality if promised in pitch. |
| **Polish** | Clear **error strings**; **loading** state while planning; **repeat** of last successful plan if useful. |
| **Logistics** | Power, USB, cable strain relief, **backup** video or photo if live arm fails. |
| **Exit criteria** | Full run-through **twice** without blocking bugs; team agrees who operates the arm and who talks. |
| **Depends on** | Milestone 4 (Milestone 3 minimum if you demo only fallback—avoid that if possible). |

---

### Milestone 6 — Stretch: native mobile + on-device STT

**Objective:** Same **companion API**; **phone** as the client with **speech → text** on device.

| Item | Detail |
| :--- | :--- |
| **Deliverables** | **Native app** (iOS and/or Android) calling the same **plan + execute** endpoints as the browser; **on-device STT**; manual **base URL** entry or simple discovery. |
| **Exit criteria** | Spoken phrase → text → plan → execute on hardware **once** on a dev device; not required for core judging if time runs out. |
| **Depends on** | Milestone 4 minimum (Milestone 5 recommended). |

---

### Milestone map (at a glance)

| # | Name | Core signal |
| :--- | :--- | :--- |
| **1** | Contracts + mock | Schemas validate; mock executes plans |
| **2** | Real adapter | Hardware runs validated plans from script |
| **3** | Browser → companion | UI drives execution (canned plan OK until M4) |
| **4** | Planner + trace | K2 → fallbacks; clarify + reasoning UI; validated plan → execute |
| **5** | Demo ready | Script + rehearsal + resilience |
| **6** | *(Stretch)* Mobile | Same API, on-device STT |

**Visual flowchart (dependencies + stretch):** [milestones-flowchart.md](milestones-flowchart.md)

## “Purpose” in v1

**Narrow:** composition of **manifest skills** + **triggers**. No separate “mission reprogramming” product surface unless scope allows; describe nuance in pitch only.

---

*NL-first design, Adeept 5 DOF, **laptop + browser MVP**, LAN companion, **K2-primary planner** with hosted fallbacks + offline plan, **clarification + reasoning** in UI without exposing raw manifest.*
