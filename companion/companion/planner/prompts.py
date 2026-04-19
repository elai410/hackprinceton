"""
Prompt builders for the planner.
Owned by WS-C. Only strings — no I/O, no model calls.

These prompts MUST be model-agnostic: the same `system_prompt` and
`user_prompt` strings are sent to every provider in the fallback chain
(today: IFM K2-Think over OpenAI-compatible HTTP, Anthropic Claude over the
native Anthropic SDK; tomorrow potentially anything else). To stay portable:

  - No tool/function calling — pure text in, JSON object out.
  - No model-specific tokens, role names, stop sequences, or system tags.
  - Reasoning-model preambles (`<think>…</think>`, scratch JSON drafts, etc.)
    are stripped post-hoc by `_strip_fences`/`_extract_json` in service.py,
    but the prompts ALSO instruct the model to keep any internal reasoning
    out of the final response so we minimise the recovery pass.
  - Markdown fences and prose preambles are explicitly forbidden so chatty
    chat-tuned models don't slip them in.

If you add a new provider, you should not need to change anything here —
adjust `_call_llm` in service.py instead.
"""

import json

from companion.inputs.registry import InputSource, render_for_prompt
from companion.models import Manifest, PriorTurn


# Cap on how many prior turns we render into the user prompt. Each turn is
# small (a few SkillCalls), so 8 keeps token cost bounded while still giving
# the model enough context to follow a multi-step refinement conversation.
MAX_HISTORY_TURNS = 8


# ---------------------------------------------------------------------------
# Shared output contract — injected into every system prompt verbatim
# ---------------------------------------------------------------------------

OUTPUT_CONTRACT = """\
OUTPUT CONTRACT (applies regardless of which model is generating this response):
- Your ENTIRE response MUST be exactly one JSON object that satisfies the schema below.
- Do NOT include any text before or after the JSON object — no greetings, no \
"Here is the JSON:", no closing remarks.
- Do NOT wrap the JSON in markdown code fences (no ```json, no ``` of any kind).
- If you need to reason internally, do so silently. Emit ONLY the final JSON \
object as your response. Any chain-of-thought or scratch work in the response \
will be discarded as malformed.
- Use straight ASCII double-quotes (") for all JSON strings. Escape internal \
quotes as \\". No smart quotes, no single quotes around keys.
- All schema fields are required. Use null (not omission) for absent optional values."""


# ---------------------------------------------------------------------------
# One-shot plan prompts
# ---------------------------------------------------------------------------


def build_plan_system_prompt(
    manifest: Manifest,
    input_sources: list[InputSource] | None = None,
) -> str:
    manifest_json = manifest.model_dump_json()
    sources_block = render_for_prompt(input_sources or [])
    return f"""\
You are Rewire, a robot control assistant. You translate natural-language \
instructions into structured execution plans for a connected robot, AND, when \
the user describes a trigger pattern (e.g. "when you hear hello, wave"), you \
also propose how to wire that trigger.

The robot itself is just an actuator. Sensing happens on the COMPANION (the \
laptop / Pi the robot is plugged into) and on any external device that POSTs \
events to /events. So even if the robot has no microphone or camera, the \
COMPANION can listen / watch on its behalf via the input sources listed below.

Currently enabled input sources on this companion:
{sources_block}

The robot's capability manifest is:
{manifest_json}

Behavior rules:
1. You MUST only use skill_ids that exist in the manifest above. Never invent \
skill names.
2. All argument values must satisfy the parameter types and bounds in the \
manifest.
3. Use display_name labels (not skill_ids) when writing reasoning for the user.
4. NEVER refuse a request by claiming "the robot can't see/hear/feel" — first \
check whether one of the input sources above provides that sense for the \
companion. Only refuse if neither the manifest nor any input source supports \
the request.
5. If the user's instruction implies a trigger pattern (typical signals: \
"when you hear ___", "when I clap", "when I say ___", "when you see ___", \
"when I press ___", "every time I do ___", "respond to ___"), produce BOTH:
     a) the action plan that should run when the trigger fires, AND
     b) a `suggested_trigger` object pointing to the matching input type \
with a sensible payload_match. For speech triggers, default to substring \
matching: `{{"normalized": "~<short keyword>"}}`. Pick the shortest \
distinctive keyword from the user's request.
   In `reasoning`, explicitly tell the user it will fire on that trigger \
(e.g. "This will run every time you say 'hello'.") so they understand it is \
not a one-shot.
6. If the request is one-shot ("wave three times now", "go home"), set \
suggested_trigger to null.
7. If the instruction is ambiguous, set needs_clarification to true, plan to \
null, suggested_trigger to null, and provide 1-2 short user-facing questions \
in "questions". Never put skill_ids or manifest excerpts in questions — use \
plain language only.
8. If the instruction asks for something neither the manifest nor any input \
source supports, set plan to null, suggested_trigger to null, and explain in \
reasoning what is missing.
9. EDIT MODE. If the user prompt contains a "Previous turns" section, treat \
the new instruction as an edit of the most recent prior plan. Keep all prior \
steps and the prior trigger unless the user explicitly removes or replaces \
them, and re-emit the FULL plan and trigger (not a diff). Only ask for \
clarification if the instruction is genuinely ambiguous given the prior \
context — do NOT re-ask things the prior turns already answered. If the \
user clearly starts an unrelated new task (e.g. switches subject entirely), \
ignore the prior plan and produce a fresh one.

{OUTPUT_CONTRACT}

Required top-level fields, in any order:
- "reasoning":          string  (plain-language explanation for the user)
- "needs_clarification": boolean
- "questions":          array of strings ([] when needs_clarification is false)
- "plan":               object with "plan_id" (string) and "steps" (array of
                        {{"skill_id": string, "arguments": object}}),
                        OR null on clarification/refusal
- "suggested_trigger":  object with "type" (string from input source list)
                        and "payload_match" (object), OR null for one-shot

Example — triggered request "when you hear hello, wave three times":
{{
  "reasoning": "I'll wave three times. This will run every time you say \\"hello\\".",
  "needs_clarification": false,
  "questions": [],
  "plan": {{
    "plan_id": "wave-on-hello",
    "steps": [
      {{"skill_id": "wave", "arguments": {{"repetitions": 3}}}},
      {{"skill_id": "go_home", "arguments": {{}}}}
    ]
  }},
  "suggested_trigger": {{
    "type": "speech",
    "payload_match": {{"normalized": "~hello"}}
  }}
}}

Example — one-shot request "wave three times now":
{{
  "reasoning": "Waving three times now.",
  "needs_clarification": false,
  "questions": [],
  "plan": {{
    "plan_id": "wave-now",
    "steps": [{{"skill_id": "wave", "arguments": {{"repetitions": 3}}}}]
  }},
  "suggested_trigger": null
}}

Example — ambiguous request "do something cool":
{{
  "reasoning": "I can do a few things — let me know which.",
  "needs_clarification": true,
  "questions": ["Should I wave, sweep the base side to side, or show text on the OLED?"],
  "plan": null,
  "suggested_trigger": null
}}

Example — EDIT MODE. The user prompt contained:
  Previous turns:
    Turn 1:
      User said: "When you hear hello, wave three times."
      Plan: [{{"skill_id": "wave", "arguments": {{"repetitions": 3}}}}]
      Suggested trigger: {{"type": "speech", "payload_match": {{"normalized": "~hello"}}}}
  Current instruction: change the trigger to be the keystroke "k" instead of hearing hello

Correct response — keep the wave plan, swap the trigger only:
{{
  "reasoning": "Switching the trigger to the \\"k\\" keystroke. The arm will still wave three times.",
  "needs_clarification": false,
  "questions": [],
  "plan": {{
    "plan_id": "wave-on-k",
    "steps": [{{"skill_id": "wave", "arguments": {{"repetitions": 3}}}}]
  }},
  "suggested_trigger": {{
    "type": "key",
    "payload_match": {{"key": "k"}}
  }}
}}
"""


def _render_history_block(history: list[PriorTurn]) -> str:
    """Render the most recent prior turns into a compact text block.

    Only the most recent MAX_HISTORY_TURNS entries are included. For each
    turn we keep user_text, the resolved plan's steps (skill_id +
    arguments only — plan_id is irrelevant for context), and the
    suggested_trigger if any. Reasoning is kept ONLY for the most recent
    turn to keep the prompt small.
    """
    if not history:
        return ""

    recent = history[-MAX_HISTORY_TURNS:]
    last_index = len(recent) - 1

    lines: list[str] = ["Previous turns:"]
    for i, turn in enumerate(recent):
        lines.append(f"  Turn {i + 1}:")
        lines.append(f"    User said: {json.dumps(turn.user_text)}")
        if turn.clarification_replies:
            joined = "; ".join(turn.clarification_replies)
            lines.append(f"    Clarification answers: {joined}")
        if i == last_index and turn.reasoning:
            lines.append(f"    Your reasoning: {turn.reasoning}")
        if turn.plan and turn.plan.steps:
            steps_compact = [
                {"skill_id": s.skill_id, "arguments": s.arguments}
                for s in turn.plan.steps
            ]
            lines.append(f"    Plan: {json.dumps(steps_compact)}")
        else:
            lines.append("    Plan: null")
        if turn.suggested_trigger is not None:
            trig = {
                "type": turn.suggested_trigger.type,
                "payload_match": turn.suggested_trigger.payload_match,
            }
            lines.append(f"    Suggested trigger: {json.dumps(trig)}")
        else:
            lines.append("    Suggested trigger: null")
    return "\n".join(lines)


def build_plan_user_prompt(
    user_text: str,
    clarification_replies: list[str],
    history: list[PriorTurn] | None = None,
) -> str:
    parts: list[str] = []
    history_block = _render_history_block(history or [])
    if history_block:
        parts.append(history_block)
    parts.append(f"Current instruction: {user_text}" if history_block else f"Instruction: {user_text}")
    if clarification_replies:
        replies = "\n".join(f"  - {r}" for r in clarification_replies)
        parts.append(f"Clarification answers:\n{replies}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Binding configuration prompts
# ---------------------------------------------------------------------------


def build_binding_system_prompt(
    manifest: Manifest,
    input_event_schema: dict,
    input_sources: list[InputSource] | None = None,
) -> str:
    manifest_json = manifest.model_dump_json()
    schema_json = json.dumps(input_event_schema, indent=2)
    sources_block = render_for_prompt(input_sources or [])
    return f"""\
You are Rewire, a robot control assistant. Your job is to create input \
bindings — mappings from sensor/input events to robot actions — that the \
companion will hot-reload and start firing on immediately.

The robot's capability manifest is:
{manifest_json}

Currently enabled input sources on this companion:
{sources_block}

The COMPLETE list of valid InputEvent types and payload shapes is:
{schema_json}

Behavior rules:
1. You MUST only use skill_ids from the manifest. Never invent skill names.
2. You MUST only use event types and payload keys defined in the input event \
schema above. Never invent gesture names, event types, or payload keys.
3. Strongly PREFER input types that appear in the "currently enabled" list \
above — those will fire immediately. Only use a non-enabled type if the user \
explicitly asks for it.
4. All plan argument values must satisfy manifest parameter bounds.
5. Each binding_id must be a unique lowercase-kebab-case string.
6. For `speech` triggers, default to substring matching: prefix the value \
with `~` and match against the `normalized` field. Example for "when you \
hear hello": \
`{{"type": "speech", "payload_match": {{"normalized": "~hello"}}}}`. Only \
use exact match when the user explicitly wants the whole spoken phrase to \
equal a fixed string. Pick the shortest distinctive keyword from the user's \
request.

{OUTPUT_CONTRACT}

Required top-level fields:
- "reasoning":  string (plain-language description of the bindings you created)
- "bindings":   array, where each element is an object with:
    - "binding_id":   unique lowercase-kebab-case string
    - "display_name": human-readable label shown in the UI
    - "trigger":      {{"type": <event type from schema>, "payload_match": <object>}}
    - "plan":         {{"plan_id": <string>, "steps": [{{"skill_id": <from manifest>, "arguments": <object>}}, ...]}}

Example — "double clap to go home, and wave when you hear hi":
{{
  "reasoning": "Two bindings: a double clap returns the arm to home, and saying \\"hi\\" triggers a wave.",
  "bindings": [
    {{
      "binding_id": "clap-twice-go-home",
      "display_name": "Double clap returns to home",
      "trigger": {{"type": "clap", "payload_match": {{"count": 2}}}},
      "plan": {{
        "plan_id": "bp-go-home",
        "steps": [{{"skill_id": "go_home", "arguments": {{}}}}]
      }}
    }},
    {{
      "binding_id": "speech-hi-wave",
      "display_name": "Wave when you hear \\"hi\\"",
      "trigger": {{"type": "speech", "payload_match": {{"normalized": "~hi"}}}},
      "plan": {{
        "plan_id": "bp-wave-hi",
        "steps": [{{"skill_id": "wave", "arguments": {{"repetitions": 2}}}}]
      }}
    }}
  ]
}}
"""


def build_binding_user_prompt(user_text: str) -> str:
    return f"Create input bindings for: {user_text}"
