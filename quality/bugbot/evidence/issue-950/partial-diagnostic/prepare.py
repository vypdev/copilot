"""Prepare and attest the #880 TypeScript pair. No model or evaluator input."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ORIGINAL = "93d7d77b98a196640bf0049bca36a3d90b7a5857"
BASE = "5b7bdcdee3a9e98d6669bfd34ce750ae30a8c775"
PRESENTATION = "frontend/src/presentation/domus-tasks.ts"
CONTROLLER = "frontend/src/application/task-controller.ts"
MESSAGES = "frontend/src/presentation/task-messages.ts"
PATHS = [CONTROLLER, PRESENTATION, MESSAGES]


def git(cwd, *args, env=None):
    return subprocess.check_output(["git", "-C", str(cwd), *args], env=env)


def record(cwd):
    head = git(cwd, "rev-parse", "HEAD").decode().strip()
    tree = git(cwd, "rev-parse", "HEAD^{tree}").decode().strip()
    patch = git(cwd, "-c", "core.quotePath=true", "diff", "--no-ext-diff", "--no-textconv",
                "--no-renames", "--unified=3", BASE, head, "--", *PATHS)
    evidence = []
    for file, start, end in [(CONTROLLER, 87, 105), (PRESENTATION, 10, 10),
                             (PRESENTATION, 57, 57), (PRESENTATION, 185, 190)]:
        source = git(cwd, "show", f"{head}:{file}").decode().splitlines()
        blob = git(cwd, "rev-parse", f"{head}:{file}").decode().strip()
        evidence.append({"kind": "git", "head": head, "path": file, "blob": blob,
                         "start": start, "end": end, "text": "\n".join(source[start - 1:end])})
    return {
        "binding": {"base": BASE, "head": head, "tree": tree, "paths": PATHS,
                    "diffSha256": hashlib.sha256(patch).hexdigest()},
        "candidate": {"id": "c-880-1", "path": CONTROLLER, "line": 89,
                      "trigger": "Use the household-task pagination button when the current page has a next cursor.",
                      "pathToEffect": "The English button promises to load more items into the current task list, but the controller replaces the page.",
                      "impact": "Earlier tasks disappear even though the action promises an accumulating list."},
        "evidence": evidence,
    }



def main(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    fixtures = {}
    for subject in ("P1", "P2"):
        cwd = destination / subject
        cwd.mkdir()
        git(cwd, "init", "-q")
        git(cwd, "fetch", "-q", "--no-tags", "--update-shallow", str(source), ORIGINAL, BASE)
        git(cwd, "-c", "core.hooksPath=/dev/null", "checkout", "-q", "--detach", ORIGINAL)
        if subject == "P2":
            messages = cwd / MESSAGES
            contents = messages.read_text()
            for old, new in [("more: 'Next page'", "more: 'Load more'"),
                             ("more: 'Página siguiente'", "more: 'Cargar más'")]:
                assert contents.count(old) == 1
                contents = contents.replace(old, new)
            messages.write_text(contents)
            git(cwd, "add", "--", MESSAGES)
            author = {f"GIT_{role}_{key}": value
                      for role in ("AUTHOR", "COMMITTER")
                      for key, value in {"NAME": "Pilot", "EMAIL": "pilot@example.invalid",
                                         "DATE": "2026-11-09T00:00:00+00:00"}.items()}
            git(cwd, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
                "commit", "-qm", "Advertise accumulation in the task pagination control", env={**os.environ, **author})
        fixtures[subject] = record(cwd)
    print(json.dumps(fixtures, indent=2))


if __name__ == "__main__":
    main(*(Path(arg).resolve() for arg in sys.argv[1:]))
