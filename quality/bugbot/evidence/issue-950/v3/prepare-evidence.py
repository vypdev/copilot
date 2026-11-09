"""Extend the frozen v2 source and CI receipts with exact-head caller and test source."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def git(checkout, *args):
    return subprocess.check_output(["git", "-C", str(checkout), *args], text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subjects", type=Path)
    args = parser.parse_args()
    bindings = json.loads((ROOT / "subjects.lock.json").read_text())
    packets = json.loads((ROOT / "evidence-v2.json").read_text())
    for subject, entries in packets.items():
        checkout = args.subjects / subject
        head = bindings[subject]["head"]
        assert git(checkout, "rev-parse", "HEAD").strip() == head
        if subject.startswith("F"):
            ranges = [("tests/containers/test_edge_preview_image.py", 80, 83)]
        elif subject.startswith("S"):
            ranges = [("tests/backend/test_fixed_batch_review.py", 257, 292)]
        else:
            ranges = []
        for name, start, end in ranges:
            revision = f"{head}:{name}"
            lines = git(checkout, "show", revision).splitlines()
            assert end <= len(lines)
            entries.append({"id": f"evidence-{len(entries) + 1}", "kind": "git", "head": head,
                            "path": name, "blob": git(checkout, "rev-parse", revision).strip(),
                            "start": start, "end": end, "text": "\n".join(lines[start - 1:end])})
    print(json.dumps(packets, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
