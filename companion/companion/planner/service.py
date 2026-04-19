"""
Planner service — K2 primary + fallback chain.
Owned by WS-C.

Two entry points:
  plan_from_nl()      — NL → one-shot Plan
  bindings_from_nl()  — NL → list of Bindings stored in BindingStore
"""

import json
import logging
import uuid
from pathlib import Path

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI, APIError, APITimeoutError

from companion.inputs.registry import available_input_sources
from companion.models import (
    Binding,
    BindingConfigureRequest,
    BindingConfigureResponse,
    Manifest,
    Plan,
    PlanRequest,
    PlanResponse,
    TriggerPattern,
    ValidationError,
)
from companion.planner.prompts import (
    build_binding_system_prompt,
    build_binding_user_prompt,
    build_plan_system_prompt,
    build_plan_user_prompt,
)
from companion.settings import Settings
from companion.validate import validate_plan

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _model_list(settings: Settings) -> list[tuple[str, str, str, str]]:
    """
    Returns [(provider, base_url, model_id, api_key), ...] in fallback order.
    provider is "openai" (OpenAI-compatible incl. K2) or "anthropic".
    Skips entries with missing API keys.
    """
    entries: list[tuple[str, str, str, str]] = []
    if settings.K2_API_KEY:
        entries.append((
            "openai",
            settings.K2_BASE_URL,
            settings.PLANNER_MODEL_PRIMARY,
            settings.K2_API_KEY,
        ))
    if settings.ANTHROPIC_API_KEY:
        for model_id in settings.PLANNER_MODEL_FALLBACKS.split(","):
            model_id = model_id.strip()
            if model_id:
                entries.append((
                    "anthropic",
                    "",
                    model_id,
                    settings.ANTHROPIC_API_KEY,
                ))
    return entries


def _extract_json(text: str) -> str:
    """
    Find a complete JSON object inside arbitrary model output.

    Reasoning models (K2-Think, DeepSeek-R1, etc.) sometimes emit free-form
    scratchpad text, embed a complete JSON object in the middle, then keep
    talking — and occasionally start a *second* JSON draft that gets cut off
    by the token limit. We need to recover the largest *valid, complete*
    object regardless of where it sits.

    Strategy: walk every `{` position, run `JSONDecoder.raw_decode` from
    there (which parses one well-formed JSON value and reports its end
    position), and remember the longest successfully-parsed substring. Pick
    the longest because partial inner objects (e.g. `{"normalized":"~hello"}`)
    are also valid JSON but not what we want.
    """
    decoder = json.JSONDecoder()
    best: str = ""
    pos = 0
    n = len(text)
    while True:
        idx = text.find("{", pos)
        if idx == -1:
            break
        try:
            _obj, end = decoder.raw_decode(text, idx)
            candidate = text[idx:end]
            if len(candidate) > len(best):
                best = candidate
            pos = end
        except json.JSONDecodeError:
            pos = idx + 1
        if pos >= n:
            break
    return best or text


def _parse_suggested_trigger(data: dict) -> "TriggerPattern | None":
    """Best-effort parse of the planner's suggested_trigger field.

    Returns None when the planner produced a one-shot plan (suggested_trigger
    omitted/null) or when the trigger object failed schema validation. We
    silently drop malformed triggers rather than failing the whole plan, so
    a successful action plan still reaches the user.
    """
    raw = data.get("suggested_trigger")
    if not raw:
        return None
    try:
        return TriggerPattern.model_validate(raw)
    except Exception as exc:
        logger.warning(f"Discarding malformed suggested_trigger: {exc}")
        return None


def _strip_fences(text: str) -> str:
    """Extract the JSON object from model output, stripping think blocks and fences."""
    import re
    # Remove <think>...</think> blocks (K2-Think, DeepSeek-R1, etc.)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    # Extract outermost valid JSON object (handles preamble reasoning text)
    return _extract_json(text)


async def _call_llm(
    system_prompt: str,
    user_prompt: str,
    settings: Settings,
) -> tuple[str, str]:
    """
    Try each model in order.
    Returns (response_text, model_id_used).
    Raises RuntimeError if all providers fail.
    """
    models = _model_list(settings)
    if not models:
        raise RuntimeError(
            "No LLM providers configured. "
            "Set K2_API_KEY or ANTHROPIC_API_KEY in .env."
        )

    last_error: Exception = RuntimeError("no providers attempted")
    for provider, base_url, model_id, api_key in models:
        try:
            if provider == "anthropic":
                client = AsyncAnthropic(
                    api_key=api_key,
                    timeout=float(settings.PLANNER_TIMEOUT_S),
                )
                resp = await client.messages.create(
                    model=model_id,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                    max_tokens=4096,
                    temperature=0.1,
                )
                content = "".join(
                    block.text for block in resp.content if getattr(block, "type", None) == "text"
                )
            else:
                client = AsyncOpenAI(
                    base_url=base_url,
                    api_key=api_key,
                    timeout=float(settings.PLANNER_TIMEOUT_S),
                )
                resp = await client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.1,
                )
                content = resp.choices[0].message.content or ""
            logger.info(f"LLM call succeeded: provider={provider} model={model_id}")
            return content, model_id
        except (APIError, APITimeoutError, Exception) as exc:
            logger.warning(f"LLM call failed for {provider}:{model_id}: {exc}")
            last_error = exc

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


# ---------------------------------------------------------------------------
# One-shot plan
# ---------------------------------------------------------------------------


async def plan_from_nl(
    request: PlanRequest,
    manifest: Manifest,
    settings: Settings,
) -> PlanResponse:
    input_sources = available_input_sources(settings)
    system_prompt = build_plan_system_prompt(manifest, input_sources)
    user_prompt = build_plan_user_prompt(
        request.user_text, request.clarification_replies, request.history
    )

    # Call LLM
    try:
        raw, model_used = await _call_llm(system_prompt, user_prompt, settings)
    except RuntimeError as exc:
        return PlanResponse(
            reasoning="All planning services are currently unavailable.",
            needs_clarification=False,
            questions=[],
            plan=None,
            validation_errors=[ValidationError(path="/", message=str(exc))],
            model_used="none",
        )

    # Parse JSON
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError as parse_err:
        # One repair attempt
        repair_prompt = (
            f"The following response was not valid JSON:\n\n{raw}\n\n"
            f"Parse error: {parse_err}\n\n"
            "Output only the corrected JSON object, no markdown fences."
        )
        try:
            raw2, model_used = await _call_llm(system_prompt, repair_prompt, settings)
            data = json.loads(_strip_fences(raw2))
        except Exception:
            return PlanResponse(
                reasoning="Failed to parse planner response.",
                needs_clarification=False,
                questions=[],
                plan=None,
                validation_errors=[ValidationError(
                    path="/", message="Planner returned invalid JSON"
                )],
                model_used=model_used if "model_used" in dir() else "none",
            )

    reasoning: str = data.get("reasoning", "")
    needs_clarification: bool = bool(data.get("needs_clarification", False))
    questions: list[str] = data.get("questions", [])
    suggested_trigger = _parse_suggested_trigger(data)

    if needs_clarification:
        return PlanResponse(
            reasoning=reasoning,
            needs_clarification=True,
            questions=questions,
            plan=None,
            validation_errors=[],
            model_used=model_used,
        )

    raw_plan = data.get("plan")
    if not raw_plan:
        return PlanResponse(
            reasoning=reasoning,
            needs_clarification=False,
            questions=[],
            plan=None,
            validation_errors=[ValidationError(
                path="/plan", message="Planner returned no plan"
            )],
            model_used=model_used,
        )

    # Parse plan schema
    try:
        plan = Plan.model_validate(raw_plan)
    except Exception as exc:
        return PlanResponse(
            reasoning=reasoning,
            needs_clarification=False,
            questions=[],
            plan=None,
            validation_errors=[ValidationError(
                path="/plan", message=f"Plan schema error: {exc}"
            )],
            model_used=model_used,
        )

    # Validate against manifest
    errors = validate_plan(manifest, plan)
    if errors:
        # One repair attempt with validation feedback
        repair_suffix = "\n\nYour previous plan had these validation errors:\n" + "\n".join(
            f"  - {e.path}: {e.message}" for e in errors
        ) + "\n\nPlease produce a corrected plan."
        try:
            raw2, model_used = await _call_llm(
                system_prompt,
                build_plan_user_prompt(
                    request.user_text, request.clarification_replies, request.history
                ) + repair_suffix,
                settings,
            )
            data2 = json.loads(_strip_fences(raw2))
            plan2 = Plan.model_validate(data2.get("plan") or {})
            errors2 = validate_plan(manifest, plan2)
            if not errors2:
                return PlanResponse(
                    reasoning=data2.get("reasoning", reasoning),
                    needs_clarification=False,
                    questions=[],
                    plan=plan2,
                    validation_errors=[],
                    model_used=model_used,
                    suggested_trigger=_parse_suggested_trigger(data2) or suggested_trigger,
                )
            errors = errors2
            reasoning = data2.get("reasoning", reasoning)
        except Exception:
            pass  # fall through to return original errors

        return PlanResponse(
            reasoning=reasoning,
            needs_clarification=False,
            questions=[],
            plan=None,
            validation_errors=errors,
            model_used=model_used,
        )

    return PlanResponse(
        reasoning=reasoning,
        needs_clarification=False,
        questions=[],
        plan=plan,
        validation_errors=[],
        model_used=model_used,
        suggested_trigger=suggested_trigger,
    )


# ---------------------------------------------------------------------------
# Binding configuration
# ---------------------------------------------------------------------------


async def bindings_from_nl(
    request: BindingConfigureRequest,
    manifest: Manifest,
    settings: Settings,
) -> BindingConfigureResponse:
    # Load input event schema for prompt grounding (WS-A fixture)
    schema_path = Path("examples/input_event_schema.json")
    try:
        input_event_schema: dict = json.loads(schema_path.read_text())
    except Exception as exc:
        logger.warning(f"Could not load input_event_schema.json: {exc}")
        input_event_schema = {}

    input_sources = available_input_sources(settings)
    system_prompt = build_binding_system_prompt(
        manifest, input_event_schema, input_sources
    )
    user_prompt = build_binding_user_prompt(request.user_text)

    try:
        raw, _model_used = await _call_llm(system_prompt, user_prompt, settings)
    except RuntimeError as exc:
        return BindingConfigureResponse(
            bindings=[],
            reasoning="All planning services are currently unavailable.",
            validation_errors=[ValidationError(path="/", message=str(exc))],
        )

    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return BindingConfigureResponse(
            bindings=[],
            reasoning="Failed to parse binding response.",
            validation_errors=[ValidationError(
                path="/", message="Planner returned invalid JSON"
            )],
        )

    reasoning: str = data.get("reasoning", "")
    raw_bindings: list = data.get("bindings", [])

    valid_bindings: list[Binding] = []
    all_errors: list[ValidationError] = []

    for i, raw_b in enumerate(raw_bindings):
        try:
            binding = Binding.model_validate(raw_b)
        except Exception as exc:
            all_errors.append(ValidationError(
                path=f"/bindings/{i}",
                message=f"Schema error: {exc}",
            ))
            continue

        plan_errors = validate_plan(manifest, binding.plan)
        if plan_errors:
            for e in plan_errors:
                all_errors.append(ValidationError(
                    path=f"/bindings/{i}/plan{e.path}",
                    message=e.message,
                ))
        else:
            if not binding.binding_id:
                binding.binding_id = str(uuid.uuid4())
            valid_bindings.append(binding)

    return BindingConfigureResponse(
        bindings=valid_bindings,
        reasoning=reasoning,
        validation_errors=all_errors,
    )
