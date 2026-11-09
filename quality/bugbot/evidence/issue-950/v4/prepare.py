"""Rebuild the expanded cohort using only immutable source and locked dependencies."""
import argparse
from base64 import b64encode
from hashlib import sha256, sha512
import json
import os
from pathlib import Path
import re
import runpy
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
HELPERS = runpy.run_path(str(ROOT / "freeze-subjects.py"))
git, materialize, record, change_once = (HELPERS[x] for x in ("git", "materialize", "record", "change_once"))
PR_BASE = "8b1cbc110c389b9cdb6ecd11317c95abf2c4b0a9"
NEW = {
    "P": (867, "b9a2dfc8179128fb493ab49666c24967d308c979", "frontend/tests/e2e/catalog.spec.ts",
          115, b"enabled:example!=='read-only'&&example!=='uncertain'", b"enabled:true"),
    "J": (875, "127cb48647efb777be8494c40239fd048c751c72", "tests/python/test_image_channel.py",
          115, b'[0, True, 1.0, "1"]', b'[0, True, 1, "1"]'),
}


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def text_slice(content, start, end):
    lines = content.decode().splitlines()
    assert 0 < start <= end <= len(lines)
    return "\n".join(lines[start-1:end])


def receipt(repo, head, path, start, end):
    locator = f"{head}:{path}"
    return {"kind":"git", "head":head, "path":path, "blob":git(repo, "rev-parse", locator).decode().strip(),
            "start":start, "end":end, "text":text_slice(git(repo, "show", locator), start, end)}


def package_receipts(repo, head, archives):
    lock = git(repo,"show",f"{head}:pnpm-lock.yaml").decode()
    lock_blob = git(repo,"rev-parse",f"{head}:pnpm-lock.yaml").decode().strip()
    for name, archive in zip(("playwright", "@playwright/test"), archives):
        digest = "sha512-" + b64encode(sha512(archive.read_bytes()).digest()).decode()
        pattern = rf"^  '?{re.escape(name)}@1\.64\.1'?:\n    resolution: \{{integrity: {re.escape(digest)}\}}"
        assert re.search(pattern, lock, re.M), name
    reads = ((archives[0], "playwright", "package/types/test.d.ts", 9314, 9315),
             (archives[0], "playwright", "package/lib/matchers/expect.js", 12773, 12780),
             (archives[1], "@playwright/test", "package/index.d.ts", 17, 17))
    entries = []
    for archive, package, source, start, end in reads:
        with tarfile.open(archive) as tar:
            stream = tar.extractfile(source)
            assert stream
            excerpt = text_slice(stream.read(), start, end)
        entries.append({"kind":"dependency", "name":package, "version":"1.64.1", "lockPath":"pnpm-lock.yaml",
                        "lockBlob":lock_blob, "source":source, "start":start, "end":end,
                        "sourceSha256":sha256(excerpt.encode()).hexdigest(), "text":excerpt})
    return entries


def make_pair(repo, prefix, head, path, before, after, destination):
    with tempfile.TemporaryDirectory(prefix="bugbot950-v4-") as tmp:
        index = str(Path(tmp)/"index")
        identity = {**os.environ, "GIT_INDEX_FILE":index,
                    "GIT_AUTHOR_NAME":"Bugbot pilot fixture", "GIT_AUTHOR_EMAIL":"pilot@example.invalid",
                    "GIT_COMMITTER_NAME":"Bugbot pilot fixture", "GIT_COMMITTER_EMAIL":"pilot@example.invalid",
                    "GIT_AUTHOR_DATE":"2026-11-09T00:00:00Z", "GIT_COMMITTER_DATE":"2026-11-09T00:00:00Z"}
        git(repo, "read-tree", head, env=identity)
        original = git(repo, "show", f"{head}:{path}")
        blob = git(repo, "hash-object", "-w", "--stdin", data=change_once(original,before,after)).decode().strip()
        mode = git(repo,"ls-tree",head,"--",path).split()[0].decode()
        git(repo, "update-index", "--cacheinfo", f"{mode},{blob},{path}", env=identity)
        tree = git(repo, "write-tree", env=identity).decode().strip()
        mutated = git(repo,"-c","commit.gpgsign=false","commit-tree",tree,"-p",head,
                      "-m",f"Frozen #950 v4 pair {prefix}",env=identity).decode().strip()
        pairs = {prefix+"1":record(repo, PR_BASE, head, [path]),
                 prefix+"2":record(repo, head, mutated, [path])}
        for key, item in pairs.items():
            materialize(repo, item, destination/key)
    return pairs


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("original", type=Path, help="v2 lab root, including the two expansion subject directories")
    cli.add_argument("domus", type=Path, help="disposable bare repo containing the four v4 revisions")
    cli.add_argument("playwright", type=Path)
    cli.add_argument("playwright_test", type=Path)
    cli.add_argument("materialized", type=Path)
    cli.add_argument("output", type=Path)
    a = cli.parse_args()
    a.materialized.mkdir()
    a.output.mkdir(exist_ok=True)
    bindings, cases, packets = {}, {}, {}
    originals = [(ROOT, a.original/"subjects", ROOT/"v3"/"evidence.json")]
    for issue in (859,861):
        cohort = ROOT/f"expansion-{issue}"
        originals.append((cohort, a.original/cohort.name/"subjects", cohort/"evidence-v2.json"))
    for cohort, checkouts, evidence in originals:
        locked = read(cohort/"subjects.lock.json")
        bindings.update(locked)
        cases.update(read(cohort/"candidates.json"))
        packets.update(read(evidence))
        for key, item in locked.items():
            materialize((checkouts/key).resolve(), item, a.materialized/key)
    cases["S2"][0].update(trigger="Request a fresh fixed replacement preview after restoring the pre-batch checkpoint.",
                          pathToEffect="The removed source check no longer rejects retained non-current records before selecting current slots.",
                          impact="The fresh preview can proceed to preparation despite an absent replacement source.")
    for prefix, (issue, head, path, line, before, after) in NEW.items():
        pairs = make_pair(a.domus.resolve(),prefix,head,path,before,after,a.materialized)
        bindings.update(pairs)
        for key, item in pairs.items():
            head = item["head"]
            repo = a.materialized/key
            if prefix == "P":
                parts = [receipt(repo,head,path,1,1),receipt(repo,head,path,106,118),
                         receipt(repo,head,"frontend/stories/administration.stories.ts",34,39),
                         *package_receipts(repo,head,(a.playwright,a.playwright_test))]
                desc = ("The matcher always expects enabled because it ignores enabled:false." if key.endswith("1")
                        else "The changed assertion explicitly expects enabled even in read-only or uncertain cases.")
                trigger,impact = "Run the built catalog cases for the read-only or uncertain story.","A disabled preferences control fails the assertion."
            else:
                parts = [receipt(repo,head,path,112,124),receipt(repo,head,"tests/browser/image_channel.py",65,83),
                         receipt(repo,head,path,13,19)]
                desc = "The list includes integer 1, whose decoded type and value match the first transport identity."
                trigger,impact = "Run the parametrized wrong-frame-identity test.","The guard accepts that frame, so pytest.raises sees no exception."
            packets[key] = parts
            cases[key] = [{"id":f"c-{issue}-{key[-1]}","path":path,"line":line,"severity":"medium",
                           "category":"reliability","trigger":trigger,"pathToEffect":desc,"impact":impact}]
    for key, items in packets.items():
        repo = a.materialized/key
        head = bindings[key]["head"]
        if key.startswith("U"):
            items += [receipt(repo,head,"packages/core/src/button-contracts.ts",13,25),
                      receipt(repo,head,"packages/core/src/contracts.ts",22,34),
                      receipt(repo,head,"packages/core/src/contracts.ts",49,55)]
        if key.startswith("S"):
            items[1] = receipt(repo,head,"backend/src/domus/application/fixed_batch_review.py",
                               365 if key=="S2" else 367, 385 if key=="S2" else 387)
            items += [receipt(repo,head,"backend/src/domus/application/recurrence_review.py",512,540),
                      receipt(repo,head,"tests/backend/test_fixed_batch_review.py",30,65)]
        for index, item in enumerate(items,1):
            item["id"] = f"evidence-{index}"
    for key, items in (("P1", packets["P1"]), ("P2", packets["P2"])):
        assert "enabled?: boolean" in next(x["text"] for x in items if x.get("source", "").endswith("test.d.ts") and x["name"] == "playwright")
        assert "to.be.disabled" in next(x["text"] for x in items if x.get("source", "").endswith("expect.js"))
    for filename, value in (("subjects.lock.json",bindings),("candidates.json",cases),("evidence.json",packets)):
        write(a.output/filename, value)


if __name__ == "__main__":
    main()
