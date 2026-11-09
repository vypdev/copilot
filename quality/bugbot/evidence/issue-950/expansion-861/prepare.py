"""Freeze #861, its matched broken-link control, and exact Git evidence."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import runpy
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
historical = "b14c308a28ecad52945a8edac6dce25ba9dfd655"
base = "171244421fcc6289180bdb94bf4e7bb52a990a1b"
doc = "docs/household-administration.md"
old = "household-administration-migration.md"
new = "household-administration-migration-missing.md"
worktrees = root / "subjects"
worktrees.mkdir()
with tempfile.TemporaryDirectory(prefix="bugbot861-") as temporary:
    repo = args.domus.resolve()
    copy = Path(temporary, "source")
    git(repo, "clone", "--quiet", "--shared", "--no-checkout", str(repo), str(copy))
    git(copy, "read-tree", historical)
    original = git(copy, "show", f"{historical}:{doc}")
    assert original.count(old.encode()) == 1
    blob = git(copy, "hash-object", "-w", "--stdin", data=original.replace(old.encode(),new.encode())).decode().strip()
    git(copy, "update-index", "--cacheinfo", f"100644,{blob},{doc}")
    tree = git(copy, "write-tree").decode().strip()
    head = git(copy, "-c", "user.name=Bugbot pilot fixture", "-c", "user.email=pilot@example.invalid",
               "-c", "commit.gpgsign=false", "commit-tree", tree, "-p", historical,
               "-m", "Frozen #861 paired fixture",
               env={**os.environ,"GIT_AUTHOR_DATE":"2026-11-09T00:00:00Z","GIT_COMMITTER_DATE":"2026-11-09T00:00:00Z"}).decode().strip()
    bindings={"M1": record(copy,base,historical,(doc,)), "M2":record(copy,historical,head,(doc,))}
    for subject,binding in bindings.items():
        materialize(copy,binding,worktrees/subject)

packets, cases = {}, {}
for subject,binding in bindings.items():
    repo=worktrees/subject
    locator=binding["head"]+":"+doc
    lines=git(repo,"show",locator).decode().splitlines()
    relative=re.search(r"\[migration/rollback limits\]\(([^)]+)\)",lines[26])[1]
    target="docs/"+relative
    listing=git(repo,"ls-tree",binding["head"],"--",target).decode().strip()
    assert bool(listing)==(subject=="M1")
    packets[subject]=[
        {"id":"evidence-1","kind":"git","head":binding["head"],"path":doc,"blob":git(repo,"rev-parse",locator).decode().strip(),
         "start":25,"end":30,"text":"\n".join(lines[24:30])},
        {"id":"evidence-2","kind":"git-tree","head":binding["head"],"path":target,"listing":listing},
    ]
    cases[subject]=[{"id":"c-861a" if subject=="M1" else "c-861b","path":doc,"line":27,
                     "severity":"medium","category":"correctness","trigger":"A reader follows the migration guide link.",
                     "pathToEffect":f"The relative target resolves to {target}, which has no tracked entry at the reviewed revision.",
                     "impact":"The migration and rollback link fails."}]
    print(subject,"oracle passed")

def write(name,obj):
    (root/name).write_text(json.dumps(obj,indent=2)+"\n")

write("subjects.lock.json",bindings)
write("evidence-v2.json",packets)
write("candidates.json",cases)
manifest=json.loads((engine/"manifest-v2.json").read_text())
manifest.update(subjectTrialCount=72, expansion=861, subjects=[{"id":s,**b} for s,b in bindings.items()],
                evidencePacketSha256=sha256((root/"evidence-v2.json").read_bytes()).hexdigest())
write("manifest-v2.json",manifest)
rows=[]
for phase in manifest["phases"]:
    for repetition in manifest["repetitions"]:
        group=[]
        for subject in bindings:
            for variant in manifest["variants"]:
                for model in manifest["models"]:
                    key=f"861/{phase}/{repetition}/{variant}/{model}/{subject}"
                    group.append(dict(trial=sha256(key.encode()).hexdigest()[:16], phase=phase,
                                      repetition=repetition, model=model, variant=variant, subject=subject))
        rows.extend(sorted(group,key=lambda r:r["trial"]))
(root/"trial-ledger.jsonl").write_text("".join(json.dumps(r)+"\n" for r in rows))
