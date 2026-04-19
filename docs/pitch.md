# ReWire — Pitch Doc

Internal team-facing doc. Use for demos, judge Q&A, and pitch meetings.

---

## A. Tagline ladder

**Hero (one line):**

> Reprogram the physical world with natural language.

**Subhead variants (pick by audience):**

- *Default / judges:* ReWire is the AI-native control layer that lets anyone change the behavior of machines with just a sentence.
- *Investors:* The integration layer for consumer robotics — Zapier for the physical world.
- *Builders / hardware nerds:* Wire any input — voice, keystroke, sensor — to any robot's capabilities. No SDK. No firmware. Just language.

**Elevator pitch (30 seconds):**

> Robots are about to ship in volume — humanoids, arms, cleaners, hobby kits — but the only people who can change what they do are engineers with the right SDK. ReWire is the integration layer that fixes that. You describe a behavior in plain English, a reasoning model composes a routine from the robot's primitives, and we run it locally. One product, every robot, every input. We're the only company building this for end users instead of OEMs.

---

## B. Competitive landscape

ReWire sits in a quadrant nobody else occupies.

```
                         END USER ↑
                                  │
            Apple Shortcuts       │      ReWire
            Home Assistant        │      ─────
            Zapier / IFTTT        │      (you are here)
            n8n                   │
                                  │
        DIGITAL ←─────────────────┼─────────────────→ PHYSICAL
                                  │
                                  │      Figure / 1X / Tesla
            OpenAI / Anthropic    │      Boston Dynamics
            (raw LLMs, no loop)   │      (build robots,
                                  │       won't open up)
                                  │
                                  │      Physical Intelligence
                                  │      Skild AI / NVIDIA GR00T
                                  │      ROS / LeRobot / Isaac
                                  │      (B2B, code, OEM-only)
                         ENGINEER ↓
```

| Cohort | Players | Why they don't beat us |
|---|---|---|
| Vertical robot builders | Figure, 1X, Tesla, Boston Dynamics | Build robots, won't open them up to third-party behavior layers — hardware margins are the business |
| Foundation-model robotics | Physical Intelligence (π0), Skild AI, NVIDIA GR00T | Sell models to OEMs, not behavior to end users; B2B GTM, no consumer surface |
| Developer middleware | ROS, LeRobot, NVIDIA Isaac SDK | Code interface; assumes engineer; no NL composition layer |
| Digital automation | Zapier, IFTTT, n8n, Apple Shortcuts, Home Assistant | Can't speak to motors — no perception, no actuation, no physical manifest |
| Raw LLMs | OpenAI, Anthropic, Gemini | Generate code, not behavior — no manifest discovery, no validation, no execution trace, no input wiring |

ReWire owns the **end-user / NL-native / multi-robot / multi-input** quadrant. Alone.

---

## C. Why we win

1. **Robot OEMs won't build this.** Their margins live in hardware. A horizontal behavior layer is a distraction at best, a commoditization risk at worst.
2. **Foundation-model companies stay B2B.** PI, Skild, GR00T are all selling embedding-and-policy stacks to manufacturers. Hardware partnerships pay better than direct-to-user.
3. **Workflow tools can't cross from digital → physical.** Zapier/IFTTT/n8n have no perception primitives, no actuation primitives, no concept of a physical capability manifest.
4. **Raw LLMs lack the closed loop.** The hard parts aren't generation — they're manifest discovery, capability validation, execution trace, input adapter wiring, and refusal of hallucinated skills. We do all five.
5. **We are the only product where a non-engineer can wire a sensor event to a robot motion in 30 seconds.**

---

## D. Wedge & expansion

**Wedge — educational and personal arms** (Adeept, Lego Spike, Hiwonder, OpenManipulator)
- Cheap, plentiful, hackable; one good demo per kit.
- Viral surface area: TikTok / YouTube / classroom adoption.
- Low integration cost per robot (manifest is the contract; we don't need their cooperation).

**Adjacent — home and hobbyist robots**
- Roomba mods, FarmBot, OpenCat, hobbyist drones.
- Same primitive shape: discrete capabilities + sensors + a desire to remix behavior.

**Long-term — consumer humanoids**
- Figure 02, 1X Neo, Tesla Optimus, Unitree.
- Own the integration-layer mindshare *before* they ship in volume. By the time the average household has a humanoid, ReWire is how you customize it. Every robot ships with a manifest; we're the runtime.

---

## E. 90-second demo arc

Each beat is timed; the spoken line is the script.

1. **(0–5s) The setup.** Arm sits still on the table.
   > "This robot ships with motors and an SDK. Most people will never write a line of code for it."

2. **(5–20s) Compose.** Type the wave + greet prompt. K2 reasoning streams in conversationally.
   > "Here, a reasoning model is composing a routine from the robot's primitives — not generating code, composing behavior."

3. **(20–35s) Run.** Click Start. Say "hello." Arm executes; on-screen blocks light up sequentially.
   > "Local execution. No cloud round-trip per fire. The model planned once; the robot runs forever."

4. **(35–50s) Refine.** "also tilt up at the end so you look proud." Edit-mode shows the planner *editing* the existing routine, not restarting.
   > "Plan history is threaded through the model — this is a real conversation, not a series of prompts."

5. **(50–65s) Vague affective.** "look sad when I press k." A 7-step expressive routine emerges (OLED, tilt, pan, grip).
   > "This is the AI-native part. The model isn't translating — it's *composing*. From two words, it built an emotional behavior."

6. **(65–90s) The close.**
   > "We're not building a robot. We're building the integration layer that makes every robot programmable in plain English. Andy Weir wrote a story about an alien named Rocky who became a best friend through nothing but patient communication. We think every robot deserves the same shot."

---

## F. Pushback cheatsheet

| Likely question | Our answer |
|---|---|
| "Why not just use Claude / GPT directly?" | Manifest discovery, capability validation, execution trace, multi-input wiring, refusal of hallucinated skills. Raw LLMs hallucinate `arm.dance()`; we ground every step in the robot's actual capability manifest. |
| "Why not target enterprise / industrial robotics?" | Wedge strategy. Consumer is where the long tail and viral distribution live. Industrial GTM is 18-month sales cycles to robotics integrators we'd lose to Cognite or PI. Consumers buy robots they can customize the same week. |
| "Isn't this just Zapier?" | Zapier can't speak to motors. We're the only product spanning perception (any input adapter) → composition (LLM planner with manifest grounding) → actuation (any robot manifest). Zapier is digital triggers → digital actions. We bridge the physical gap. |
| "Anthropomorphism / over-promise?" | Our claim is *autonomy*, not intelligence. The AI is composing routines from primitives the robot already has. We're not pretending the robot feels — we're letting users describe *what they want it to do* in the same vocabulary they'd use to describe it to a friend. |
| "What about safety / hallucinated motions?" | Every step is validated against the manifest before execution. We can only emit skills the robot ships with. The planner cannot invent torque limits, joint ranges, or new capabilities. |
| "Why now?" | Three things converged: (1) reasoning models cheap enough to run per-prompt, (2) consumer robots shipping with structured capability APIs, (3) post-Voice-AI users expect to talk to machines. Three years ago, none of these were true. |
| "What's the moat?" | Two: (a) the manifest format becomes a network effect — every robot we ship with becomes a reason for the next one to publish a manifest; (b) the planner gets better with every robot we add (more primitives = better composition transfer). Classic two-sided integration layer dynamics.

---

## G. Closing line for any pitch

> Every interesting platform shift in computing has had a moment when the integration layer arrived: terminals → shells, web → browsers, mobile → app stores, SaaS → Zapier. Robotics is overdue. We're building it.
