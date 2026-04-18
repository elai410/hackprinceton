"""
validate_plan: pure function, no I/O.
Returns a list of ValidationError — empty means valid.
Callers decide whether to HTTP-reject or log.
"""

from companion.models import Manifest, Plan, ValidationError


def validate_plan(manifest: Manifest, plan: Plan) -> list[ValidationError]:
    errors: list[ValidationError] = []

    if not plan.steps:
        errors.append(ValidationError(path="/steps", message="plan must have at least one step"))
        return errors

    skill_map = {skill.id: skill for skill in manifest.skills}

    for i, step in enumerate(plan.steps):
        base = f"/steps/{i}"

        if step.skill_id not in skill_map:
            valid_ids = sorted(skill_map.keys())
            errors.append(ValidationError(
                path=f"{base}/skill_id",
                message=f"unknown skill_id '{step.skill_id}'; valid ids: {valid_ids}",
            ))
            continue  # cannot validate arguments without knowing the skill

        skill = skill_map[step.skill_id]

        # Reject unknown argument keys
        for arg_key in step.arguments:
            if arg_key not in skill.parameters:
                errors.append(ValidationError(
                    path=f"{base}/arguments/{arg_key}",
                    message=f"unknown argument '{arg_key}' for skill '{step.skill_id}'",
                ))

        # Check each declared parameter
        for param_name, param_schema in skill.parameters.items():
            if param_name not in step.arguments:
                errors.append(ValidationError(
                    path=f"{base}/arguments/{param_name}",
                    message=f"missing required argument '{param_name}'",
                ))
                continue

            value = step.arguments[param_name]
            param_type = param_schema.get("type")

            # Type check
            if param_type == "integer":
                if not isinstance(value, int) or isinstance(value, bool):
                    errors.append(ValidationError(
                        path=f"{base}/arguments/{param_name}",
                        message=f"expected integer, got {type(value).__name__}",
                    ))
                    continue
            elif param_type == "number":
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    errors.append(ValidationError(
                        path=f"{base}/arguments/{param_name}",
                        message=f"expected number, got {type(value).__name__}",
                    ))
                    continue

            # Bounds check
            if "minimum" in param_schema and value < param_schema["minimum"]:
                errors.append(ValidationError(
                    path=f"{base}/arguments/{param_name}",
                    message=(
                        f"value {value} is below minimum {param_schema['minimum']}"
                    ),
                ))
            if "maximum" in param_schema and value > param_schema["maximum"]:
                errors.append(ValidationError(
                    path=f"{base}/arguments/{param_name}",
                    message=(
                        f"value {value} exceeds maximum {param_schema['maximum']}"
                    ),
                ))

    return errors
