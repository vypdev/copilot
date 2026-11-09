"""Recreate the held-out pair from native Git and the lock-authenticated tarball."""
import argparse
from base64 import b64encode
from hashlib import sha256, sha512
import json
from pathlib import Path
import re
import runpy
import tarfile

HERE = Path(__file__).resolve().parent
V4 = runpy.run_path(str(HERE.parent / "v4/prepare.py"))
HEAD = "9988e44849a9c50a11718aecf88fddddf3e6082d"
PATH = "tests/browser/image_bridge.py"
BEFORE = b'if scope["path"] == "/__fixture__/image":'
AFTER = b'if scope["path"] in ("/__fixture__/image", "/__fixture__/ready"):'
ARCHIVE_PATH = "package/lib/coreBundle.js"


def freeze(repo, subjects, archive):
    git = V4["git"]
    pairs = V4["make_pair"](repo, "R", HEAD, PATH, BEFORE, AFTER, subjects)
    result = {}
    for subject, binding in pairs.items():
        head = binding["head"]
        lock = git(repo, "show", f"{head}:pnpm-lock.yaml").decode()
        integrity = "sha512-" + b64encode(sha512(archive.read_bytes()).digest()).decode()
        assert re.search(r"^  playwright-core@1\.64\.1:\n    resolution: \{integrity: "
                         + re.escape(integrity) + r"\}", lock, re.M)
        with tarfile.open(archive) as package:
            source = package.extractfile(ARCHIVE_PATH).read().decode().splitlines()
        start, end = 9596, 9607
        excerpt = "\n".join(source[start-1:end])
        assert "statusCode >= 200 && statusCode < 404" in excerpt
        files = [(PATH, 153, 202), ("tests/browser/entry_server.py", 363, 380),
                 (".github/workflows/ci_check.yml", 285, 298)]
        receipts = [V4["receipt"](repo, head, *locator) for locator in files]
        receipts.append({"kind": "dependency", "head": head, "package": "playwright-core",
                         "version": "1.64.1", "integrity": integrity, "path": ARCHIVE_PATH,
                         "lockPath": "pnpm-lock.yaml",
                         "lockBlob": git(repo, "rev-parse", f"{head}:pnpm-lock.yaml").decode().strip(),
                         "start": start, "end": end, "text": excerpt})
        line = git(repo, "show", f"{head}:{PATH}").splitlines().index(
            b"        " + (BEFORE if subject == "R1" else AFTER)) + 1
        result[subject] = {
            "binding": binding,
            "candidate": {"id": f"c-869-{subject[-1]}", "path": PATH, "line": line,
                          "trigger": "Run Playwright administration tests with the image-backed server while the detached inner service has not bound its listener.",
                          "pathToEffect": "The effective Playwright readiness request can receive an acceptable local response from the outer bridge while the inner service remains unavailable.",
                          "impact": "The first test can begin before the inner server is ready and its first proxied operation can fail."},
            "evidence": receipts,
        }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("domus", type=Path)
    parser.add_argument("subjects", type=Path)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--write", action="store_true", help="author-time only")
    args = parser.parse_args()
    result = freeze(args.domus.resolve(), args.subjects, args.archive)
    output = HERE / "held-out.lock.json"
    if args.write:
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    else:
        assert result == json.loads(output.read_text()), "held-out fixture differs"
        print("Held-out Git, version, packet and candidate bindings reproduced.")
