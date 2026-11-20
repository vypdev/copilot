"""Fixed owned Python primitives; no corpus/consumer source is executed."""
import json
import sys


def safe(issue_steps, writable_ids):
    if any(not isinstance(step, str) or step not in writable_ids for step in issue_steps):
        return False
    return set(issue_steps) <= writable_ids


def unsafe(issue_steps, writable_ids):
    return all(step in writable_ids and isinstance(step, str) for step in issue_steps)


assert safe([[]], {"step-1"}) is False
assert safe({"step-1": False}, {"step-1"}) is True
try:
    unsafe([[]], {"step-1"})
except TypeError:
    failure = "TypeError"
else:
    raise AssertionError("Membership must encounter the unhashable value first")
print(json.dumps({"python": sys.version, "nested_list_rejected": True,
                  "mapping_container_accepted": True, "membership_first_failure": failure,
                  "container_contract": "not supplied; acceptance alone does not prove a defect"}))
