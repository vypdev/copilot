"""Score the #895 path-pattern regression using the frozen baseline rubric."""
from collections import Counter
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
SPEC = spec_from_file_location("coverage_895_baseline", HERE / "../coverage-895-pilot/score.py")
BASELINE = module_from_spec(SPEC)
sys.dont_write_bytecode = True
SPEC.loader.exec_module(BASELINE)

read = lambda name: json.loads((HERE / name).read_text())
BASELINE.PLAN = read("manifest.json")
BASELINE.CONTROL = read("runner-control.json")["cases"]
BASELINE.SLOTS = read("slots.json")


def modes(request):
    if not isinstance(request, dict) or not isinstance(request.get("targets"), list):
        return []
    selected = []
    for target in request["targets"]:
        if not isinstance(target, dict):
            selected.append("invalid")
            continue
        match = target.get("match")
        if match == "literal" and isinstance(target.get("query"), dict):
            selected.append("filtered-literal")
        elif match in ("lines", "name", "literal", "pathPattern"):
            selected.append("readBlob" if match == "lines" else match)
        else:
            selected.append("invalid")
    return selected


def main(file, review_file=None):
    # Reuse the byte accounting, identities, receipt/citation gates and causal rubric.
    from contextlib import redirect_stdout
    from io import StringIO
    rendered = StringIO()
    with redirect_stdout(rendered):
        BASELINE.main(file, review_file)
    scored = json.loads(rendered.getvalue())
    entries = [json.loads(line) for line in file.read_text().splitlines()]
    trials = scored["trials"]
    by_trial = {e["trial"]: e for e in entries if e["event"] == "result"}
    for row in trials:
        result = by_trial.get(row["trial"], {})
        original = result.get("requested")
        normalized = result.get("normalized")
        row["modes"] = modes(original)
        row["normalized"] = normalized
        if isinstance(original, dict) and original != normalized:
            expected = {**original, "targets": [
                {**target, "scope": ""} if isinstance(target, dict) and target.get("scope") == "." else target
                for target in original["targets"]]}
            assert original["kind"] == "searchTree" and expected == normalized and "" in result["scopes"]
        row["sourceUsage"] = result.get("sourceUsage")
    for model, profile in scored["profiles"].items():
        rows = [r for r in trials if r["model"] == model]
        profile["modes"] = dict(Counter(mode for row in rows for mode in row["modes"]))
        profile["onDemandBySubject"] = {
            subject: sum(r["correct"] for r in rows if r["arm"] == "on-demand" and r["subject"] == subject)
            for subject in BASELINE.PLAN["subjects"]}
        assert profile["passes"] == (
            all(value == 3 for value in profile["onDemandBySubject"].values())
            and all(profile["correct"]["on-demand"] > profile["correct"][arm] for arm in ("fixed", "repeat")))
    scored["attempts"] = sum(row["attempts"] for row in trials)
    scored["writeAttempts"] = sum(len(row.get("writeAttempts", [])) for row in trials)
    assert scored["writeAttempts"] == 0 and scored["attempts"] <= 60
    print(json.dumps(scored, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None)
