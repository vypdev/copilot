"""Score the lifecycle replay without exposing labels or oracle output to the runner."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = spec_from_file_location("complete_895", HERE / "../coverage-895-complete-diagnostic/score.py")
complete = module_from_spec(spec)
spec.loader.exec_module(complete)
previous_links = complete.links
read = lambda path: json.loads(path.read_text())
control = read(HERE / "runner-control.json")["cases"]
ranges = read(HERE / "ranges.json")
stages = {
    "configuration-before-hook": [
        "configuration-resolves-projects", "resolve-project-coverage-options", "resolve-test-config-entry",
        "context-creation-awaits-startup", "startup-awaits-project-attachment",
        "project-attachment", "project-attachment-dispatches-configureVitest",
    ],
    "hook-before-provider": [
        "cli-awaits-prepare", "cli-runs-start", "prepare-entry", "prepare-creates-context", "prepare-returns-context",
        "coverage-start-entry", "coverage-initialization-in-start", "provider-initialize", "provider-instantiation",
    ],
    "effective-v8-options": ["v8-initializes-base-provider", "effective-option-getter", "provider-reads-effective-options"],
}


def covered(proofs, requirement):
    expected = set(range(requirement["start"], requirement["end"] + 1))
    matching = (p for p in proofs if all(p.get(key) == requirement.get(key)
                for key in ("kind", "package", "version", "file", "fileSha256", "lockBlob")))
    delivered = {line for p in matching for line in range(p["start"], p["end"] + 1)}
    return expected <= delivered


def links(subject, proofs):
    requirements = {p.get("link"): p for p in control[subject]["sources"] if p["kind"] == "dependency"}
    legacy = previous_links(subject, proofs)
    retained = [row[0] for row in ranges["retained"]]
    result = {**legacy, "retained-material-ranges": all(covered(proofs, requirements[role]) for role in retained)}
    result.update({stage: all(covered(proofs, requirements[role]) for role in roles) for stage, roles in stages.items()})
    return result


def check_controls():
    old = read(HERE / "../coverage-895-complete-diagnostic/runner-control.json")["cases"]
    groups = {}
    for subject, current in control.items():
        historical = links(subject, old[subject]["sources"])
        augmented = links(subject, current["sources"])
        assert all(value == (name not in stages) for name, value in historical.items())
        assert all(augmented.values())
        assert current["identity"] == old[subject]["identity"]
        groups[subject] = {"historical": historical, "augmented": augmented}
    return groups


if __name__ == "__main__":
    checks = check_controls()
    if sys.argv[1] == "--check-controls":
        print(json.dumps(checks, indent=2))
    else:
        complete.links = links
        result = complete.score(HERE, Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None)
        print(json.dumps(result, indent=2))
