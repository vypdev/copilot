"""Freeze allowed source and CI packets for the v2 qualification profile."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("subjects", type=Path)
parser.add_argument("pytest_python", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
bindings = json.loads((root / "subjects.lock.json").read_text())
ranges = {
    "U": [
        ("packages/core/src/presentation-text.ts", 1, 12),
        ("package.json", 1, 14),
    ],
    "F": [
        ("tests/containers/test_app_image.py", 122, 142),
        ("tests/containers/test_app_compatibility.py", 120, 144),
    ],
    "S": [
        ("backend/src/domus/application/fixed_batch_review.py", 194, 248),
        ("backend/src/domus/application/fixed_batch_review.py", 356, 385),
        ("backend/src/domus/infrastructure/sqlite_recurrence.py", 182, 216),
    ],
}
pytest_source = subprocess.check_output([str(args.pytest_python), "-I", "-c",
    "import pytest, inspect, _pytest.compat; assert pytest.__version__ == '9.2.0'; print(inspect.getsource(_pytest.compat.getfuncargnames), end='')"], text=True)
packets = {}
for subject, binding in bindings.items():
    entries = []
    for path, start, end in ranges[subject[0]]:
        repository = args.subjects / subject
        locator = binding["head"] + ":" + path
        git = ["git", "-C", str(repository)]
        blob = subprocess.check_output([*git, "rev-parse", locator], text=True).strip()
        lines = subprocess.check_output([*git, "show", locator], text=True).splitlines()
        entries.append({"kind": "git", "head": binding["head"], "path": path, "blob": blob,
                        "start": start, "end": min(end, len(lines)), "text": "\n".join(lines[start-1:end])})
    if subject.startswith("F"):
        lock = subprocess.check_output(["git", "-C", str(args.subjects / subject), "show", "HEAD:uv.lock"], text=True)
        section = next(part for part in lock.split("[[package]]") if part.lstrip().startswith('name = "pytest"'))
        assert 'version = "9.2.0"' in section
        entries.append({"kind": "dependency", "name": "pytest", "version": "9.2.0",
                        "lockBlob": subprocess.check_output(["git", "-C", str(args.subjects / subject), "rev-parse", "HEAD:uv.lock"], text=True).strip(),
                        "contract": "_pytest.compat.getfuncargnames",
                        "sourceSha256": sha256(pytest_source.encode()).hexdigest(), "text": pytest_source})
    if subject == "F1":
        entries.append({"kind": "native-ci", "head": binding["head"], "run": 42294011539, "job": 128154446414,
                        "checkout": "a76a8629c65499e5eb601abd83cdb3503179142e", "sourceDiffPaths": 0,
                        "command": "uv run pytest tests/containers --no-cov",
                        "observation": "Frozen dependency sync completed. ARM64 job reported 42 passed for that command."})
    packets[subject] = [dict(id=f"evidence-{n}", **entry) for n, entry in enumerate(entries, 1)]
print(json.dumps(packets, indent=2, ensure_ascii=False))
