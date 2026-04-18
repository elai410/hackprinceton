# AI coding agents: start here (Quoridor robot demo)

This repository’s **Quoridor + Adeept arm + webcam + K2** work is specified for parallel human and agent development.

---

## Before you build anything (required)

**Do not start writing or editing code until you have explicitly aligned with the human.** Agents must be **active** about scope and intent.

1. **Ask which subsystem (Owner) this session covers**
  If the human did not say, ask directly, e.g.:  
   *“Should I work on **Owner 1** (contracts + vision + markers), **Owner 2** (engine + K2), or **Owner 3** (arm + orchestrator + CLI)? Or something else (docs-only, integration)?”*
2. **Confirm intent before implementation**
  Ask **short clarifying questions** until you know:
  - **Outcome:** scaffold only, one feature, tests, bugfix, or doc change?
  - **Constraints:** touch only certain paths? No `contracts` break? Fake-only / no hardware?
  - **Integration:** Is this PR meant to merge before/after **G0** (contracts)?
3. **If anything is ambiguous, stop and ask**
  Prefer **one or two precise questions** over guessing (e.g. wall notation, serial port API, which engine repo). Do not infer Owner boundaries from vague prompts.
4. **After the human confirms**, restate in **one sentence** what you will do and which directories you will touch, then proceed.

Details and Owner table: **[quoridor-workstreams-and-contracts.md](quoridor-workstreams-and-contracts.md)** (see §0.4).

---

## Read first (order matters)

1. **[quoridor-demo-feasibility-and-framework.md](quoridor-demo-feasibility-and-framework.md)** — product context, rules, risks, coach add-on, hardware reality (Adeept 5 DOF, commercial board).
2. **[quoridor-workstreams-and-contracts.md](quoridor-workstreams-and-contracts.md)** — **authoritative** onboarding: **3 human owners**, directory ownership, **contracts**, interfaces, integration gates, merge rules, fake stack, checklists, **§0.4 agent interaction protocol**.

Do **not** re-derive `GameState` or wire cross-package imports outside the dependency rule in the workstreams doc.

---

## Human team model

Work is split across **three** people. Each person owns a **disjoint set** of top-level packages; agents should stay within the package assigned for this session unless the human explicitly requests an integration PR.


| Person | Role (short)            | Packages                                         |
| ------ | ----------------------- | ------------------------------------------------ |
| **1**  | Perception & contracts  | `contracts/`, `vision/`, `assets/markers/`       |
| **2**  | Engine & K2             | `engine_adapter/`, `llm_k2/`                     |
| **3**  | Arm, orchestration, CLI | `orchestrator/`, `arm_driver/`, `apps/demo_cli/` |


Details, protocols, and PR rules: **workstreams doc §1–§4, §0.4, §10–§12**.