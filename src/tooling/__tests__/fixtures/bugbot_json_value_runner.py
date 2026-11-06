"""Optional stdlib-only probe. Runs only its fixed authored sibling, never input source."""
import ast
import hashlib
import json
from pathlib import Path
import platform
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bugbot_json_value_probe as owned

NAMES = (
    "decoded_object", "nested_outer_object", "text_decoder", "guarded_text_cast",
    "unicode_nested_value", "separate_serialization_levels", "object_cast_into_text_reader",
    "text_encoded_twice", "raw_object_into_text_reader", "python_repr_as_json",
    "missing_inner_decode", "annotation_is_not_conversion",
)
source = Path(owned.__file__).read_bytes()
text = source.decode("utf8")
tree = ast.parse(text)
observations = []
for name in NAMES:
    node = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name)
    try:
        value = getattr(owned, name)()
        observation = {"valueType": type(value).__name__, "value": value}
    except (TypeError, ValueError) as error:
        observation = {"exception": type(error).__name__, "message": str(error)}
    observations.append({"id": name, "startLine": node.lineno, "endLine": node.end_lineno, **observation})
value = owned.object_frame().decode()
assert isinstance(value, dict) and owned.cast(str, value) is value
print(json.dumps({"python": platform.python_version(), "probeSha256": hashlib.sha256(source).hexdigest(),
    "castIdentityObserved": True, "observations": observations}, ensure_ascii=False, indent=2))
