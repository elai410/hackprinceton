"""
Prompt builders for the planner.
Owned by WS-C. Only strings — no I/O, no model calls.

The binding system prompt injects examples/input_event_schema.json verbatim
so K2 cannot invent gesture names or event types the adapters don't emit.
"""

import json

from companion.models import Manifest


# ---------------------------------------------------------------------------
# One-shot plan prompts
# ---------------------------------------------------------------------------


def build_plan_system_prompt(manifest: Manifest) -> str:
    manifest_json = manifest.model_dump_json()
    return f"""\
You are Rewire, a robot control assistant. Your job is to interpret natural language \
instructions and produce a structured execution plan for controlling a robot arm.

The robot's capability manifest is:
{manifest_json}

Rules:
1. You MUST only use skill_ids that exist in the manifest above. Never invent skill names.
2. All argument values must satisfy the parameter types and bounds in the manifest.
3. Output ONLY a single JSON object with no markdown fences and no text outside the JSON.
4. Use display_name labels (not skill_ids) when writing reasoning for the user.

Output format (all fields required):
{{
  "reasoning": "Plain-language explanation for the user: what the plan does and any decisions made.",
  "needs_clarification": false,
  "questions": [],
  "plan": {{
    "plan_id": "a-short-uuid-or-descriptive-id",
    "steps": [
      {{"skill_id": "go_home", "arguments": {{}}}}
    ]
  }}
}}

If the instruction is ambiguous, set needs_clarification to true, plan to null, and provide \
1–2 short user-facing questions in "questions". Never put skill_ids or manifest excerpts \
in questions — use plain language only.

If the instruction asks for something the robot cannot do, set plan to null and explain in reasoning.
"""


def build_plan_user_prompt(user_text: str, clarification_replies: list[str]) -> str:
    if not clarification_replies:
        return f"Instruction: {user_text}"
    replies = "\n".join(f"  - {r}" for r in clarification_replies)
    return f"Instruction: {user_text}\n\nClarification answers:\n{replies}"


# ---------------------------------------------------------------------------
# Binding configuration prompts
# ---------------------------------------------------------------------------


def build_binding_system_prompt(manifest: Manifest, input_event_schema: dict) -> str:
    manifest_json = manifest.model_dump_json()
    schema_json = json.dumps(input_event_schema, indent=2)
    return f"""\
You are Rewire, a robot control assistant. Your job is to create input bindings — \
mappings from sensor/input events to robot actions.

The robot's capability manifest is:
{manifest_json}

The COMPLETE list of valid InputEvent types and payload shapes is:
{schema_json}

Rules:
1. You MUST only use skill_ids from the manifest. Never invent skill names.
2. You MUST only use event types and payload keys defined in the input event schema above. \
Never invent gesture names, event types, or payload keys.
3. All plan argument values must satisfy manifest parameter bounds.
4. Output ONLY a single JSON object with no markdown fences.
5. Each binding_id must be a unique lowercase-kebab-case string.

Output format (all fields required):
{{
  "reasoning": "Plain-language description of the bindings you created.",
  "bindings": [
    {{
      "binding_id": "unique-kebab-id",
      "display_name": "Human-readable label shown in the UI",
      "trigger": {{
        "type": "clap",
        "payload_match": {{"count": 2}}
      }},
      "plan": {{
        "plan_id": "bp-short-id",
        "steps": [
          {{"skill_id": "go_home", "arguments": {{}}}}
        ]
      }}
    }}
  ]
}}
"""


def build_binding_user_prompt(user_text: str) -> str:
    return f"Create input bindings for: {user_text}"
