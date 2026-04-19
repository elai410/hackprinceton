"""
match_event: pure function, no I/O.
Owned by WS-A: same tier as validate.py — testable without any infrastructure.
"""

from companion.models import Binding, BindingConfig, InputEvent


def match_event(event: InputEvent, config: BindingConfig) -> list[Binding]:
    """
    Return all bindings whose trigger matches the given InputEvent.

    Match rules:

    - ``trigger.type`` must equal ``event.type`` (exact string match).
    - For each entry in ``trigger.payload_match``:
        * If the expected value is a string starting with ``~``, the rest of
          the string is treated as a case-insensitive substring needle and
          the corresponding payload value must be a string that contains it.
          This is used for fuzzy speech matching:
              {"normalized": "~hello"}  fires when payload.normalized
              contains "hello" anywhere.
        * Otherwise, exact equality is required (subset semantics — extra
          keys in event.payload are ignored).
    """
    matches: list[Binding] = []
    for binding in config.bindings:
        trigger = binding.trigger
        if trigger.type != event.type:
            continue
        if _payload_matches(trigger.payload_match, event.payload):
            matches.append(binding)
    return matches


def _payload_matches(pattern: dict, payload: dict) -> bool:
    for key, expected in pattern.items():
        actual = payload.get(key)

        # `~substring` — case-insensitive contains match against a string
        if isinstance(expected, str) and expected.startswith("~"):
            needle = expected[1:].lower().strip()
            if not isinstance(actual, str):
                return False
            if needle and needle not in actual.lower():
                return False
            continue

        if actual != expected:
            return False
    return True
