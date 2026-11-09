"""Materialize the reserved ha-ui revisions in two disposable Git checkouts."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ORIGINAL = "55174696e97a4c8b424c7f57d7da7a61e4b157fd"
BASE = "d885bccf2c3152c3151471d3efaabd901429d6bd"
TARGET = "packages/core/src/components/navigation-overflow.ts"


def git(cwd, *args, env=None):
    return subprocess.check_output(["git", "-C", str(cwd), "-c", "core.hooksPath=/dev/null",
                                    "-c", "commit.gpgsign=false", *args], env=env, timeout=60)


def record(cwd):
    head = git(cwd, "rev-parse", "HEAD").decode().strip()
    tree = git(cwd, "rev-parse", "HEAD^{tree}").decode().strip()
    diff = git(cwd, "-c", "core.quotePath=true", "diff", "--no-ext-diff", "--no-textconv",
               "--no-renames", "--unified=3", BASE, head, "--", TARGET)
    assert git(cwd, "status", "--porcelain") == b""
    assert git(cwd, "remote") == b""
    return {
        "binding": {"base": BASE, "head": head, "tree": tree, "paths": [TARGET],
                    "diffSha256": hashlib.sha256(diff).hexdigest()},
        "candidate": {"id": "c-892-1", "path": TARGET, "line": 107,
                      "trigger": "Drag a navigation item horizontally, release outside the bar, then make a fresh pointer click on Overview.",
                      "pathToEffect": "The outside mouseup preserves click suppression, which can carry into the next pointer gesture.",
                      "impact": "The fresh Overview click emits no selection request."},
        "evidence": [],
    }


def main(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    records = {}
    for subject in ("N1", "N2"):
        cwd = destination / subject
        cwd.mkdir()
        git(cwd, "init", "-q")
        git(cwd, "fetch", "-q", "--no-tags", str(source), ORIGINAL, BASE)
        git(cwd, "checkout", "-q", "--detach", ORIGINAL)
        if subject == "N2":
            file = cwd / TARGET
            original = file.read_bytes()
            old = b"#down=(event:MouseEvent):void=>{\n    this.#finishDrag();"
            assert original.count(old) == 1
            file.write_bytes(original.replace(old, old.replace(b"#finishDrag()", b"#finishDrag(true)")))
            git(cwd, "add", "--", TARGET)
            identity = {f"GIT_{role}_{key}": value
                        for role in ("AUTHOR", "COMMITTER")
                        for key, value in {"NAME": "Pilot", "EMAIL": "pilot@example.invalid",
                                           "DATE": "2026-11-09T00:00:00Z"}.items()}
            git(cwd, "commit", "-qm", "Preserve drag suppression on fresh mousedown", env={**os.environ, **identity})
            assert git(cwd, "diff", "--name-only", ORIGINAL, "HEAD").decode().strip() == TARGET
        records[subject] = record(cwd)
    print(json.dumps(records, indent=2))


if __name__ == "__main__":
    main(*(Path(arg).resolve() for arg in sys.argv[1:]))
