"""Prepare and attest the #913 TypeScript pair. No model or evaluator input."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ORIGINAL = "3c7d0c8b57cc6a53c611646e12a33b752d481730"
BASE = "5b7bdcdee3a9e98d6669bfd34ce750ae30a8c775"
PRESENTATION = "frontend/src/presentation/domus-tasks.ts"
PARSER = "frontend/src/domain/tasks.ts"
PATHS = [PRESENTATION, PARSER]


def git(cwd, *args, env=None):
    return subprocess.check_output(["git", "-C", str(cwd), *args], env=env)


def record(cwd):
    head = git(cwd, "rev-parse", "HEAD").decode().strip()
    tree = git(cwd, "rev-parse", "HEAD^{tree}").decode().strip()
    patch = git(cwd, "-c", "core.quotePath=true", "diff", "--no-ext-diff", "--no-textconv",
                "--no-renames", "--unified=3", BASE, head, "--", *PATHS)
    source = git(cwd, "show", f"{head}:{PRESENTATION}").decode().splitlines()
    blob = git(cwd, "rev-parse", f"{head}:{PRESENTATION}").decode().strip()
    return {
        "binding": {"base": BASE, "head": head, "tree": tree, "paths": PATHS,
                    "diffSha256": hashlib.sha256(patch).hexdigest()},
        "candidate": {"id": "c-913-1", "path": PRESENTATION, "line": 145,
                      "trigger": "Submit a material quantity of 1.123456 for a precision-6 material.",
                      "pathToEffect": "The advertised precision and input guard admit six digits, but the canonical quantity parser rejects the value.",
                      "impact": "The completion form rejects a quantity that its displayed precision allows."},
        "evidence": [{"kind": "git", "head": head, "path": PRESENTATION, "blob": blob,
                      "start": start, "end": end, "text": "\n".join(source[start - 1:end])}
                     for start, end in [(5, 7), (20, 27), (115, 124)]],
    }


def main(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    fixtures = {}
    for subject in ("H1", "H2"):
        cwd = destination / subject
        cwd.mkdir()
        git(cwd, "init", "-q")
        git(cwd, "fetch", "-q", "--no-tags", "--update-shallow", str(source), ORIGINAL, BASE)
        git(cwd, "-c", "core.hooksPath=/dev/null", "checkout", "-q", "--detach", ORIGINAL)
        if subject == "H2":
            parser = cwd / PARSER
            contents = parser.read_bytes()
            before, after = rb"\.[0-9]{0,5}[1-9]", rb"\.[0-9]{0,4}[1-9]"
            assert contents.count(before) == 1
            parser.write_bytes(contents.replace(before, after))
            git(cwd, "add", "--", PARSER)
            author = {f"GIT_{role}_{key}": value
                      for role in ("AUTHOR", "COMMITTER")
                      for key, value in {"NAME": "Pilot", "EMAIL": "pilot@example.invalid",
                                         "DATE": "2026-11-09T00:00:00+00:00"}.items()}
            git(cwd, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
                "commit", "-qm", "Narrow the canonical material quantity pattern", env={**os.environ, **author})
        fixtures[subject] = record(cwd)
    print(json.dumps(fixtures, indent=2))


if __name__ == "__main__":
    main(*(Path(arg).resolve() for arg in sys.argv[1:]))
