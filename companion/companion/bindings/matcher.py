"""
match_event: pure function, no I/O.
Owned by WS-A: same tier as validate.py — testable without any infrastructure.
"""

from companion.models import Binding, BindingConfig, InputEvent


def match_event(event: InputEvent, config: BindingConfig) -> list[Binding]:
    """
    Return all bindings whose trigger matches the given InputEvent.

    Match rule:
    - trigger.type must equal event.type (exact string match)
    - every key/value pair in trigger.payload_match must be present and equal
      in event.payload (subset match — extra keys in event.payload are ignored)
    """
    matches: list[Binding] = []
    for binding in config.bindings:
        trigger = binding.trigger
        if trigger.type != event.type:
            continue
        if all(event.payload.get(k) == v for k, v in trigger.payload_match.items()):
            matches.append(binding)
    return matches
