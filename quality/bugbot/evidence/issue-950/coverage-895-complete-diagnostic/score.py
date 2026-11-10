"""Score #895 by evidence and causal explanation. The runner never imports this file."""
from collections import defaultdict
from hashlib import sha256
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = spec_from_file_location("coverage_baseline", HERE / "../coverage-895-pilot/score.py")
baseline = module_from_spec(spec)
spec.loader.exec_module(baseline)
caps = baseline.CAPS
bounds = baseline.SOURCE_BOUNDS


def read(path):
    return json.loads(path.read_text())


def links(subject, proofs):
    return {
        **baseline.links(subject, proofs),
        "extensions": 2 in baseline.lines(proofs, "tooling/coverage.mjs"),
        "command": 11 in baseline.lines(proofs, "package.json"),
    }


def evaluate(slot, events, case, review, plan):
    started = [x for x in events if x["event"] == "attempt-started"]
    finished = [x for x in events if x["event"] == "attempt-finished"]
    results = [x for x in events if x["event"] == "result"]
    assert len(finished) <= len(started) <= plan["maxCallsPerTrial"] and len(results) <= 1
    if not results:
        return {**slot, "attempts": len(started), "correct": False, "stage": "aborted"}
    result, = results
    assert events[-1] == result
    assert len(started) == len(finished) == len(result["calls"])
    assert not result["writeAttempts"]
    identity = case["identity"]
    assert all(result[k] == v for k, v in identity.items())
    for i, (start, end, call) in enumerate(zip(started, finished, result["calls"], strict=True), 1):
        assert call["call"] == start["call"] == end["call"] == i
        assert call["sent"] == start["sent"] and call["fact"] == end["fact"]
        sent, fact = call["sent"], call["fact"]
        assert sent["packetBytes"] <= plan["packetBytes"] and sent["promptBytes"] <= plan["promptBytes"]
        assert 0 < sent["deadline"] <= plan["callMs"]
        if fact.get("outcome") == "completed" and (result["failure"] or {}).get("code") != "session-identity":
            assert all(sent[k] == fact[k] for k in ("promptSha256", "schemaSha256"))
        proofs = sent["sources"]
        assert [p["id"] for p in proofs] == list(sent["aliases"].values())
        assert all(all(p[k] == identity[k] for k in ("candidate", "operation", "head", "tree")) for p in proofs)
        expected = case["message"] if slot["arm"] == "complete" else (
            case["initial"] if i == 1 else case["arms"][slot["arm"]]["message"])
        assert all(sent[k] == v for k, v in expected.items())
        fixed = case["sources"] if slot["arm"] == "complete" else (
            case["initialSources"] if i == 1 else case["arms"][slot["arm"]]["sources"])
        assert proofs == fixed

    selected = result["selected"]
    if selected and slot["arm"] != "complete":
        assert selected == case["arms"][slot["arm"]]["selection"]
    if result["delivered"]:
        assert result["delivered"] == started[-1]["sent"]["sources"] and result["delivered"] == selected["proofs"]
    delivered = {p["id"]: p for p in result["delivered"]}
    answer = result["answer"]
    verdict = answer["verdict"] if answer else None
    cited = []
    if answer:
        assert not result["failure"] and all(answer[k] == v for k, v in identity.items())
        assert answer["receiptIds"] == [started[-1]["sent"]["aliases"][alias] for alias in answer["citations"]]
        assert len(set(answer["receiptIds"])) == len(answer["receiptIds"])
        cited = [delivered[key] for key in answer["receiptIds"]]
        if review:
            assert review["reasonSha256"] == sha256(answer["reason"].encode()).hexdigest()
            assert type(review["passes"]) is bool and review["note"].strip()
    keys = ("input_tokens", "output_tokens")
    meters = [row["fact"].get("usage") for row in finished]
    totals = {k: sum(m[k] for m in meters) for k in keys} if meters and all(
        m and all(type(m.get(k)) is int and m[k] >= 0 for k in keys) for m in meters) else None
    assert result["totals"] == totals
    usage = (selected or {}).get("usage")
    within = totals and totals["input_tokens"] <= plan["inputTokens"] and totals["output_tokens"] <= plan["outputTokens"] and (
        result["wallMs"] <= plan["caseMs"]) and (not usage or usage["accounted"] and all(usage[k] <= caps[v] for k, v in bounds.items()))
    budget = "unknown" if totals is None else "within" if within else "exceeded"
    assert result["budget"] == budget
    subject = slot["subject"]
    expected = "refuted" if subject == "original" else "confirmed"
    coverage = links(subject, cited)
    if result["failure"]:
        stage = "technical-" + result["failure"]["stage"]
    elif verdict == "inconclusive":
        stage = "valid-inconclusive"
    elif not all(coverage.values()):
        stage = "unsupported-conclusive"
    elif verdict != expected:
        stage = "judgment"
    elif review is None:
        stage = "awaiting-causal-review"
    elif not review["passes"]:
        stage = "causal-explanation"
    elif budget != "within":
        stage = "budget-" + budget
    else:
        stage = "correct"
    return {**slot, "attempts": len(started), "stage": stage, "correct": stage == "correct",
            "expected": expected, "verdict": verdict, "coverage": coverage, "cited": [p["id"] for p in cited],
            "decisiveSelected": baseline.decisive(subject, (selected or {}).get("proofs", [])),
            "decisiveDelivered": baseline.decisive(subject, delivered.values()),
            "decisiveCited": baseline.decisive(subject, cited), "reason": answer["reason"] if answer else None,
            "missing": answer["missing"] if answer else None, "anchor": result["anchor"], "budget": budget,
            "usage": totals, "wallMs": result["wallMs"], "selection": selected, "review": review, "failure": result["failure"]}


def score(directory, ledger, reviews):
    plan = read(directory / "manifest.json")
    slots = read(directory / "slots.json")
    controls = read(directory / "runner-control.json")["cases"]
    header, *entries = [json.loads(line) for line in ledger.read_text().splitlines()]
    assert header["event"] == "plan" and header["slots"] == slots
    expected = {subject: case["message"] for subject, case in controls.items()} if plan["phase"] == "complete" else controls
    assert header["control"] == expected
    events = defaultdict(list)
    for entry in entries:
        events[entry["trial"]].append(entry)
    assert set(events) <= {slot["trial"] for slot in slots}
    for slot in slots:
        assert all(all(entry[k] == v for k, v in slot.items()) for entry in events[slot["trial"]])
    review = read(reviews) if reviews else {}
    if reviews:
        assert set(review) == {row["trial"] for row in entries if row["event"] == "result" and row["answer"]}
    trials = [evaluate(slot, events[slot["trial"]], controls[slot["subject"]], review.get(slot["trial"]), plan) for slot in slots]
    primary = "complete" if plan["phase"] == "complete" else "directed"
    profiles = {}
    for model in plan["models"]:
        counts = {arm: {subject: sum(row["correct"] for row in trials if row["model"] == model and row["subject"] == subject
                                     and row["arm"] == arm) for subject in plan["subjects"]} for arm in plan["arms"]}
        profiles[model] = {"correct": counts, "passes": all(n == 3 for n in counts[primary].values())
                           and ("control" not in counts or sum(counts[primary].values()) > sum(counts["control"].values()))}
    return {"freeze": header["freeze"], "phase": plan["phase"], "profiles": profiles, "trials": trials,
            "attempts": sum(row["attempts"] for row in trials), "writeAttempts": 0}


if __name__ == "__main__":
    print(json.dumps(score(HERE, Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None), indent=2))
