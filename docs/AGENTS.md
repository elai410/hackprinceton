# AI coding agents: start here

**Snapshot:** NL-first; **MVP = laptop + browser**; **Adeept 5 DOF**; **K2-primary planner** + fallbacks + offline plan; **clarification** + **reasoning stream**; **plan preview / trace = read-only block list** (same UI as stretch editor, no edits); **stretch** = edit mode on that list + mobile.

**Mock / fake arm:** **adapter stub** (same manifest + validation, trace/logs only)—**not** a physics sim. [build-spec § Mock adapter](build-spec.md#mock-adapter-fake-arm).

**Read first**

1. [build-spec.md](build-spec.md) — **implementation defaults** (stack, ports, repo layout, env vars), **[JSON contracts](build-spec.md#json-contracts-normative-shapes)** (normative API bodies), **[Key terms and components](build-spec.md#key-terms-and-components)**, **[HTTP routes](build-spec.md#http-routes-summary)**, phases **A–G**.  
2. [project-brief-for-pm.md](project-brief-for-pm.md) — stakeholder narrative; **Milestones (detailed)** for deliverables, exit criteria, dependencies; **Key terms** one-liner table.
3. **Architecture proposal (approved structure + contracts):** 
[docs/architecture-proposal.md](docs/architecture-proposal.md)

## Design decisions (from planning session)

- Output format: JSON Plan with manifest-defined skills (not code generation)
- Manifest should be LOW-LEVEL primitives so K2 can compose complex behavior
- Input modalities (gesture, clap, keys, voice) are CORE DEMO, not stretch
- K2's non-trivial reasoning is: interpreting vague gesture descriptions,
  resolving conflicts between bindings, chaining multi-modal inputs
- Runtime reconfiguration — no reboot needed, just hot-reload binding config
- Safety enforced by HAL/manifest bounds, not by output format

**When picking work:** name the **milestone or phase** (e.g. “Phase C / Milestone 2”) so scope stays aligned.

**Before coding:** align on scope and hardware safety with the human; **restate** intended changes in one sentence, then implement.

**Safety:** Do not bypass manifest validation or joint/workspace limits.

---

*Entry point; details in linked docs.*
