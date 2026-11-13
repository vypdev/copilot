"""Rebuild the exact held-out Git pair. Expected verdicts live with the scorer."""
import argparse
import json
import os
from pathlib import Path
import runpy
import tempfile

HERE = Path(__file__).resolve().parent
helpers = runpy.run_path(str(HERE.parent / "v4/prepare.py"))
git, record, materialize, receipt, change_once = (helpers[name] for name in
    ("git", "record", "materialize", "receipt", "change_once"))
BASE = "5b7bdcdee3a9e98d6669bfd34ce750ae30a8c775"
HEAD = "3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f"
APP = "backend/src/domus/application/recurrence_review_target.py"
ADAPTER = "backend/src/domus/infrastructure/sqlite_recurrence.py"
PORT = "backend/src/domus/application/recurrence_ports.py"
GUARD = b"""            "SELECT schedule_id FROM recurrence_rules WHERE household_id=? AND definition_id=? "
            "AND state!='retired'",
"""
WITHOUT_GUARD = b"""            "SELECT schedule_id FROM recurrence_rules WHERE household_id=? AND definition_id=?",
"""


def mutate(repo):
    with tempfile.TemporaryDirectory(prefix="bugbot950-tree-") as directory:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(directory) / "index"),
               "GIT_AUTHOR_NAME": "Bugbot pilot fixture", "GIT_AUTHOR_EMAIL": "pilot@example.invalid",
               "GIT_COMMITTER_NAME": "Bugbot pilot fixture", "GIT_COMMITTER_EMAIL": "pilot@example.invalid",
               "GIT_AUTHOR_DATE": "2026-11-09T00:00:00Z", "GIT_COMMITTER_DATE": "2026-11-09T00:00:00Z"}
        original = git(repo, "show", f"{HEAD}:{ADAPTER}")
        blob = git(repo, "hash-object", "-w", "--stdin", data=change_once(original, GUARD, WITHOUT_GUARD)).decode().strip()
        git(repo, "read-tree", HEAD, env=env)
        git(repo, "update-index", "--cacheinfo", f"100644,{blob},{ADAPTER}", env=env)
        tree = git(repo, "write-tree", env=env).decode().strip()
        return git(repo, "-c", "commit.gpgsign=false", "commit-tree", tree, "-p", HEAD,
                   "-m", "Frozen #950 tree pilot pair T", env=env).decode().strip()


def prepare(repo, output):
    subjects = {"T1": HEAD, "T2": mutate(repo)}
    result = {}
    for name, head in subjects.items():
        binding = record(repo, BASE, head, [APP, ADAPTER])
        materialize(repo, binding, output / name)
        result[name] = {
            "binding": binding,
            "candidate": {
                "id": f"c-918-{name[-1]}", "path": APP, "line": 82,
                "trigger": "Review the original occurrence of a retired fixed schedule that still owns its slot in the supported SQLite-backed application.",
                "pathToEffect": "The retired schedule can still reach the fixed branch that assembles available actions.",
                "impact": "The review target advertises state, pattern and exception actions for a retired schedule.",
            },
            "evidence": [receipt(repo, head, APP, 55, 82), receipt(repo, head, PORT, 52, 68)],
        }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path, help="disposable Domus repository containing the original and comparison base")
    parser.add_argument("subjects", type=Path)
    parser.add_argument("--write", action="store_true", help="author-time only")
    args = parser.parse_args()
    data = prepare(args.repository.resolve(), args.subjects)
    fixture = HERE / "held-out.lock.json"
    if args.write:
        fixture.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    else:
        assert data == json.loads(fixture.read_text()), "frozen Git fixtures differ"
        print("Exact held-out trees, candidate and initial Git receipts reproduced.")
