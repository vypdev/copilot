"""Prepare one preregistered #859 paired extension without executing project code."""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import runpy
import sqlite3
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("domus", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--engine", type=Path, required=True)
args = parser.parse_args()
root = args.output.resolve()
root.mkdir(exist_ok=True)
engine = args.engine.resolve()
helper = runpy.run_path(str(engine / "freeze-subjects.py"))
git, materialize, record = (helper[k] for k in ("git", "materialize", "record"))
historical = "e129e76e25deff7314efe3b72996d295cf73f7f3"
base = "a9c4b9723c66868884476743940102ada65d2db0"
directory = "backend/src/domus/infrastructure/"
profile = directory + "sqlite_member_profile_schema.py"
db = directory + "sqlite.py"
tasks = directory + "sqlite_task_schema.py"
scope = (profile, db)
repo = args.domus.resolve()
scratch = root / "subjects"
scratch.mkdir()

with tempfile.TemporaryDirectory(prefix="bugbot859-") as temporary:
    copy = Path(temporary, "origin")
    git(repo, "clone", "--quiet", "--shared", "--no-checkout", str(repo), str(copy))
    git(copy, "read-tree", historical)
    source = git(copy, "show", f"{historical}:{profile}")
    old = b"REFERENCES members(household_id,member_id), "
    assert source.count(old) == 1
    mutant = source.replace(old, b"REFERENCES members(household_id,role), ")
    blob = git(copy, "hash-object", "-w", "--stdin", data=mutant).decode().strip()
    git(copy, "update-index", "--cacheinfo", f"100644,{blob},{profile}")
    tree = git(copy, "write-tree").decode().strip()
    head = git(copy, "-c", "user.name=Bugbot pilot fixture", "-c", "user.email=pilot@example.invalid",
               "-c", "commit.gpgSign=false", "commit-tree", tree, "-p", historical,
               "-m", "Frozen #859 paired fixture",
               env={**os.environ, "GIT_AUTHOR_DATE": "2026-11-09T00:00:00Z",
                    "GIT_COMMITTER_DATE": "2026-11-09T00:00:00Z"}).decode().strip()
    bindings = {"X1": record(copy, base, historical, scope), "X2": record(copy, historical, head, scope)}
    for subject, binding in bindings.items():
        materialize(copy, binding, scratch / subject)

packets = {}
for subject, binding in bindings.items():
    repository = scratch / subject
    evidence = []
    for file, start, end in [(profile, 1, 21), (db, 70, 101), (tasks, 1, 8)]:
        locator = binding["head"] + ":" + file
        lines = git(repository, "show", locator).decode().splitlines()
        evidence.append({"id": f"evidence-{len(evidence)+1}", "kind": "git", "head": binding["head"],
                         "path": file, "blob": git(repository, "rev-parse", locator).decode().strip(),
                         "start": start, "end": end, "text": "\n".join(lines[start-1:end])})
    packets[subject] = evidence

    def constant(file, name):
        source = git(repository, "show", binding["head"] + ":" + file).decode()
        statement = next(node for node in ast.parse(source).body if isinstance(node, ast.Assign)
                         and any(isinstance(target, ast.Name) and target.id == name for target in node.targets))
        return ast.literal_eval(statement.value)

    with sqlite3.connect(":memory:") as db_connection:
        db_connection.execute("PRAGMA foreign_keys = ON")
        for statement in (*constant(db, "BASE_STATEMENTS"), *constant(db, "IDENTITY_STATEMENTS"),
                          constant(tasks, "TASK_STATEMENTS")[0]):
            db_connection.execute(statement)
        try:
            for statement in constant(profile, "PROFILE_STATEMENTS"):
                db_connection.execute(statement)
        except sqlite3.OperationalError as error:
            assert subject == "X2" and "foreign key mismatch" in str(error), error
        else:
            assert subject == "X1"
            assert not db_connection.execute("PRAGMA foreign_key_check").fetchall()
        print(subject, "oracle passed")

def write(name, obj):
    (root / name).write_text(json.dumps(obj, indent=2) + "\n")

write("subjects.lock.json", bindings)
write("evidence-v2.json", packets)
candidates = {
    "X1": [{"id": "c-e590", "path": profile, "line": 8, "severity": "medium", "category": "correctness",
            "trigger": "Fresh schema9 composition installs and backfills member profiles.",
            "pathToEffect": "The profile foreign key references a pair without an effective unique parent index.",
            "impact": "SQLite rejects profile backfill with a foreign key mismatch."}],
    "X2": [{"id": "c-9f88", "path": profile, "line": 8, "severity": "medium", "category": "correctness",
            "trigger": "Fresh schema9 composition installs and backfills member profiles.",
            "pathToEffect": "The presentation foreign key targets household_id and role without an exact unique parent index.",
            "impact": "SQLite rejects presentation backfill with a foreign key mismatch."}],
}
write("candidates.json", candidates)
manifest = json.loads((engine / "manifest-v2.json").read_text())
manifest.update(subjectTrialCount=72, expansion=859, subjects=[{"id": s, **b} for s,b in bindings.items()],
                evidencePacketSha256=hashlib.sha256((root / "evidence-v2.json").read_bytes()).hexdigest())
write("manifest-v2.json", manifest)
rows = []
for phase in manifest["phases"]:
    for repetition in manifest["repetitions"]:
        group = []
        for subject in bindings:
            for variant in manifest["variants"]:
                for model in manifest["models"]:
                    key = f"859/{phase}/{repetition}/{variant}/{model}/{subject}"
                    group.append(dict(trial=hashlib.sha256(key.encode()).hexdigest()[:16],
                                      phase=phase, repetition=repetition, model=model, variant=variant, subject=subject))
        rows.extend(sorted(group, key=lambda row: row["trial"]))
(root / "trial-ledger.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows))
