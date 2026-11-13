"""Freeze repository-shaped fixtures without changing either input repository."""

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import argparse
import json
import os
import subprocess


ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
SCOPES = {
    "U1": ("packages/core/src/presentation-text.ts",),
    "F1": (
        "tests/containers/test_app_image.py",
        "tests/containers/test_app_compatibility.py",
        "tests/containers/test_edge_preview_image.py",
    ),
    "S1": ("backend/src/domus/application/fixed_batch_review.py",),
}
COMMIT_DATE = "2026-11-09T00:00:00Z"


def git(repo, *args, data=None, env=None):
    return subprocess.run(
        ["git", "-C", str(repo), *args], input=data, stdout=subprocess.PIPE,
        check=True, env=env,
    ).stdout


def change_once(content, before, after):
    if content.count(before) != 1:
        raise ValueError(f"Expected exactly one mutation target: {before!r}")
    return content.replace(before, after)


def mutate(subject_id, content):
    if subject_id == "U2":
        return change_once(content, b"]/u.test", b"]/.test")
    if subject_id == "F2":
        signature = b"    expected_schema: int = 10,\n"
        call = b'snapshot_roundtrip(name, json.loads(after.stdout)["instance_id"], expected_schema)'
        return change_once(
            change_once(content, signature, signature + b"    *,\n    expected_schema_fixture: int,\n"),
            call, call.replace(b"expected_schema)", b"expected_schema_fixture)"),
        )
    if subject_id == "S2":
        guard = (
            b"    if unit.recurrence.has_absent_fixed_slot_from(home, rule.schedule_id, nominal):\n"
            b'        raise Conflict("recurrence_review_source_absent")\n'
        )
        return change_once(content, guard, b"")
    raise ValueError(f"Unknown synthetic subject {subject_id}")


def record(repo, base, head, paths):
    diff = git(repo, "-c", "core.quotePath=true", "diff", "--no-ext-diff", "--no-textconv",
               "--no-renames", "--unified=3", base, head, "--", *paths)
    if not diff:
        raise ValueError(f"Empty review scope for {head}")
    return {
        "base": base,
        "head": head,
        "tree": git(repo, "rev-parse", head + "^{tree}").decode().strip(),
        "paths": list(paths),
        "diffSha256": sha256(diff).hexdigest(),
    }


def materialize(repo, binding, destination):
    destination.mkdir()
    git(destination, "init", "-q")
    # Shallow fetch copies the two immutable trees and does not expose upstream refs.
    git(destination, "-c", "protocol.file.allow=always", "fetch", "-q", "--depth=1",
        "--no-tags", repo.as_uri(), binding["head"], binding["base"])
    git(destination, "-c", "core.hooksPath=/dev/null", "checkout", "-q", "--detach", binding["head"])
    (destination / ".git" / "FETCH_HEAD").unlink()
    actual = record(destination, binding["base"], binding["head"], binding["paths"])
    if any(actual[key] != binding[key] for key in actual):
        raise ValueError("Materialized review binding differs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ha_ui", type=Path)
    parser.add_argument("domus", type=Path)
    parser.add_argument("--materialize", type=Path)
    options = parser.parse_args()
    repositories = {"vypdev/ha-ui": options.ha_ui, "vypdev/domus": options.domus}
    if options.materialize:
        options.materialize.mkdir(exist_ok=False)
    originals = {}
    subjects = {}
    with TemporaryDirectory(prefix="bugbot-950-freeze-") as scratch:
        for subject in MANIFEST["subjects"]:
            identifier = subject["id"]
            if "deriveFrom" not in subject:
                repo = repositories[subject["repository"]].resolve()
                originals[identifier] = (repo, subject)
                for filename, expected in subject["blobs"].items():
                    actual = git(repo, "rev-parse", f"{subject['head']}:{filename}").decode().strip()
                    if actual != expected:
                        raise ValueError(f"Unexpected blob for {identifier} {filename}")
                binding = record(repo, subject["base"], subject["head"], SCOPES[identifier])
                if binding["tree"] != subject["tree"]:
                    raise ValueError(f"Unexpected historical tree for {identifier}")
                subjects[identifier] = binding
                if options.materialize:
                    materialize(repo, binding, options.materialize / identifier)
                continue

            origin = subject["deriveFrom"]
            repo, historical = originals[origin]
            base = historical["head"]
            paths = SCOPES[origin]
            filename = paths[0]
            copy = Path(scratch, identifier)
            git(repo, "clone", "--quiet", "--shared", "--no-checkout", str(repo), str(copy))
            git(copy, "read-tree", base)
            original = git(copy, "show", f"{base}:{filename}")
            blob = git(copy, "hash-object", "-w", "--stdin", data=mutate(identifier, original)).decode().strip()
            mode = git(copy, "ls-tree", base, "--", filename).split()[0].decode()
            git(copy, "update-index", "--cacheinfo", f"{mode},{blob},{filename}")
            tree = git(copy, "write-tree").decode().strip()
            identity = {
                "GIT_AUTHOR_NAME": "Bugbot pilot fixture", "GIT_AUTHOR_EMAIL": "pilot@example.invalid",
                "GIT_COMMITTER_NAME": "Bugbot pilot fixture", "GIT_COMMITTER_EMAIL": "pilot@example.invalid",
                "GIT_AUTHOR_DATE": COMMIT_DATE, "GIT_COMMITTER_DATE": COMMIT_DATE,
            }
            head = git(copy, "-c", "commit.gpgSign=false", "commit-tree", tree, "-p", base,
                       "-m", "Frozen pilot fixture", env={**os.environ, **identity}).decode().strip()
            subjects[identifier] = {**record(copy, base, head, paths), "mutatedBlob": blob}
            if options.materialize:
                materialize(copy, subjects[identifier], options.materialize / identifier)

    print(json.dumps(subjects, indent=2))


if __name__ == "__main__":
    main()
