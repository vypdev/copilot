"""Evaluate the #895 pilot ledger without sending oracle data to the verifier."""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent


def read(name):
    return json.loads((HERE / name).read_text())


PLAN = read("manifest.json")
CONTROL = read("runner-control.json")["cases"]
SLOTS = read("slots.json")
CAPS = read("../detector-verifier-diagnostic/manifest.json")["packetCeiling"]
SOURCE_BOUNDS = {"elapsedMs": "sourceMs", "sourceBytes": "sourceBytes", "evidenceBytes": "evidenceBytes",
                 "openedFiles": "openedFiles", "matches": "matches", "treeEntries": "treeEntries", "receipts": "receipts"}
GROUPS = {
    "collection": {"pattern-normalization", "storybook-test-include"},
    "exclusion": {"shared-coverage", "append-project-include", "exclude-tested-and-untested"},
    "report": {"v8-source-filter", "v8-remap-tested-file", "v8-merge-tested-and-untested",
               "report-from-coverage-map", "summary-writer"},
}


def lines(proofs, path):
    return {line for proof in proofs if proof.get("path") == path for line in range(proof["start"], proof["end"] + 1)}


def decisive(subject, proofs):
    expected = {12, 14} if subject == "original" else {*range(12, 21), 23}
    return expected <= lines(proofs, "vitest.config.ts")


def links(subject, proofs):
    dependency = {p.get("link") for p in proofs if p["kind"] == "dependency"}
    return {
        "collection": GROUPS["collection"] <= dependency and {3, 5} <= lines(proofs, ".storybook/main.ts"),
        "exclusion": GROUPS["exclusion"] <= dependency and decisive(subject, proofs),
        "report": GROUPS["report"] <= dependency,
        "inventory": {7, 8, 9, 10, 11} <= lines(proofs, "tests/coverage-evidence.test.mjs")
                     and {36, 37, 38} <= lines(proofs, "tooling/coverage.mjs"),
    }


def evaluate(slot, events, review):
    subject, arm = slot["subject"], slot["arm"]
    case = CONTROL[subject]
    identity = case["identity"]
    started = [e for e in events if e["event"] == "attempt-started"]
    finished = [e for e in events if e["event"] == "attempt-finished"]
    results = [e for e in events if e["event"] == "result"]
    request_events = [e for e in events if e["event"] == "request"]
    lookup_events = [e for e in events if e["event"] == "lookup"]
    assert len(finished) <= len(started) <= (1 if arm == "fixed" else PLAN["maxCallsPerTrial"])
    assert len(results) <= 1 and len(lookup_events) <= len(request_events) <= 1
    if not results:
        return {**slot, "status": "aborted", "stop": "technical", "attempts": len(started), "correct": False}
    result, = results
    assert events[-1] == result
    assert not result["writeAttempts"]
    assert all(result[key] == value for key, value in identity.items())
    assert len(finished) == len(started) == len(result["calls"])
    if request_events:
        assert all(result[k] == request_events[0][k] for k in ("requested", "admission"))
    if lookup_events:
        assert result["lookup"] == lookup_events[0]["lookup"] and result["retrieved"] == lookup_events[0]["newProofs"]
    if arm != "on-demand":
        assert not result["retrieved"] and result["sourceUsage"]["openedFiles"] == 0
    if started:
        assert all(started[0]["sent"][k] == v for k, v in case["initial"].items())
        assert started[0]["sent"]["sources"] == case["initialSources"]

    known = {p["id"]: p for p in case["initialSources"]}
    retrieved = {p["id"]: p for p in result["retrieved"]}
    delivered = {}
    for index, (start, end, call) in enumerate(zip(started, finished, result["calls"], strict=True), 1):
        assert start["call"] == end["call"] == call["call"] == index
        assert start["sent"] == call["sent"] and end["fact"] == call["fact"]
        sent, fact = call["sent"], call["fact"]
        assert 0 < sent["deadline"] <= PLAN["callMs"]
        assert sent["packetBytes"] <= PLAN["packetBytes"] and sent["promptBytes"] <= PLAN["promptBytes"]
        if fact.get("promptSha256") and result["failure"] != {"stage": "delivery" if index == 2 else "initial", "code": "session-identity"}:
            assert all(fact[key] == sent[key] for key in ("promptSha256", "schemaSha256"))
        proofs = {p["id"]: p for p in sent["sources"]}
        assert list(proofs) == list(sent["aliases"].values())
        assert len(proofs) == len(sent["sources"])
        expected = known if index == 1 else {**known, **retrieved}
        assert proofs == expected
        for proof in proofs.values():
            assert all(proof[k] == identity[k] for k in ("head", "tree", "operation", "candidate"))
        if fact.get("turnStartedMs") is not None or fact.get("turnCompletions", 0) > 0:
            delivered = proofs

    answer = result["answer"]
    cited = {}
    causal = None
    if answer:
        assert not result["failure"] and all(answer[k] == v for k, v in identity.items())
        assert answer["receiptIds"] == [started[-1]["sent"]["aliases"][alias] for alias in answer["citations"]]
        assert len(set(answer["receiptIds"])) == len(answer["receiptIds"])
        cited = {key: delivered[key] for key in answer["receiptIds"]}
        if review:
            assert review["reasonSha256"] == sha256(answer["reason"].encode()).hexdigest()
            assert type(review["passes"]) is bool and review["note"].strip()
            causal = review["passes"]

    meters = [e["fact"].get("usage") for e in finished]
    keys = ("input_tokens", "output_tokens")
    metered = bool(meters) and all(u and all(type(u.get(k)) is int and u[k] >= 0 for k in keys) for u in meters)
    budget = "unknown"
    if metered:
        totals = {k: sum(u[k] for u in meters) for k in keys}
        assert totals == result["totals"]
        usage = result["sourceUsage"]
        budget = "within" if (result["wallMs"] <= PLAN["caseMs"] and totals["input_tokens"] <= PLAN["inputTokens"]
                              and totals["output_tokens"] <= PLAN["outputTokens"] and usage["accounted"]
                              and all(usage[k] <= CAPS[cap] for k, cap in SOURCE_BOUNDS.items())) else "exceeded"
    assert budget == result["budget"]

    stages = {
        "retrieval": decisive(subject, retrieved.values()),
        "delivery": decisive(subject, (p for key, p in delivered.items() if key in retrieved)),
        "citation": decisive(subject, (p for key, p in cited.items() if key in retrieved)),
    }
    coverage = links(subject, cited.values())
    expected = "refuted" if subject == "original" else "confirmed"
    verdict = answer["verdict"] if answer else None
    failure = result["failure"]
    if failure:
        status = "technical-failure"
    elif verdict is None:
        status = "unresolved-request"
    elif verdict == "inconclusive":
        status = "valid-inconclusive"
    elif not all(coverage.values()):
        status = "unsupported-conclusive"
    elif verdict != expected:
        status = "judgment-error"
    elif causal is None:
        status = "awaiting-causal-review"
    elif not causal:
        status = "causal-explanation"
    elif budget != "within":
        status = "budget-" + budget
    else:
        status = "correct"

    admitted = bool(result["admission"] and result["admission"]["status"] == "admitted")
    if status == "correct" and all(stages.values()):
        stop = None
    elif failure and failure["stage"] == "initial":
        stop = "technical-initial"
    elif result["requested"] is None:
        stop = "request"
    elif not admitted:
        stop = "admission"
    elif arm == "fixed":
        stop = "fixed-stop"
    elif arm == "repeat":
        stop = "withheld-control"
    elif not stages["retrieval"]:
        stop = "retrieval"
    elif not stages["delivery"]:
        stop = "delivery"
    elif not stages["citation"] or (answer and verdict != "inconclusive" and not all(coverage.values())):
        stop = "citations" if answer else "verdict"
    elif status.startswith("budget-"):
        stop = "budget"
    else:
        stop = "verdict"

    return {**slot, "attempts": len(started), "status": status, "stop": stop,
            "correct": status == "correct" and all(stages.values()), "expected": expected, "verdict": verdict,
            "requested": result["requested"], "admission": result["admission"], "lookup": result["lookup"],
            "retrieved": result["retrieved"], "deliveredIds": list(delivered), "citedIds": list(cited),
            "stages": stages, "coverage": coverage, "failure": failure, "budget": budget,
            "anchor": result["anchor"], "usage": result["totals"], "wallMs": result["wallMs"],
            "reason": answer["reason"] if answer else None, "missing": answer["missing"] if answer else None,
            "review": review, "writeAttempts": result["writeAttempts"]}


def main(file, review_file):
    header, *entries = [json.loads(line) for line in file.read_text().splitlines()]
    assert header["event"] == "plan" and header["slots"] == SLOTS
    assert header["initial"] == {subject: case["initial"] for subject, case in CONTROL.items()}
    grouped = defaultdict(list)
    for event in entries:
        grouped[event["trial"]].append(event)
    assert set(grouped) <= {slot["trial"] for slot in SLOTS}
    for slot in SLOTS:
        assert all(all(event[k] == v for k, v in slot.items()) for event in grouped[slot["trial"]])
    review = json.loads(review_file.read_text()) if review_file else {}
    if review_file:
        assert set(review) == {e["trial"] for e in entries if e["event"] == "result" and e["answer"]}
    trials = [evaluate(slot, grouped[slot["trial"]], review.get(slot["trial"])) for slot in SLOTS]
    profiles = {}
    for model in PLAN["models"]:
        rows = [row for row in trials if row["model"] == model]
        counts = {arm: sum(row["correct"] for row in rows if row["arm"] == arm) for arm in PLAN["arms"]}
        profiles[model] = {"correct": counts, "passes": counts["on-demand"] == 6 and
                           all(counts["on-demand"] > counts[arm] for arm in ("fixed", "repeat"))}
    print(json.dumps({"freeze": header["freeze"], "profiles": profiles, "trials": trials}, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None)
