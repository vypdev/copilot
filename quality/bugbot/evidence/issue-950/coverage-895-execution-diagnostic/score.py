"""Score the frozen execution-evidence diagnostic. Expected labels stay here."""
from collections import defaultdict
from hashlib import sha256
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = spec_from_file_location("lifecycle_895", HERE / "../coverage-895-lifecycle-diagnostic/score.py")
lifecycle = module_from_spec(spec)
spec.loader.exec_module(lifecycle)
read = lambda path: json.loads(path.read_text())
plan = read(HERE / "manifest.json")
slots = read(HERE / "slots.json")
controls = read(HERE / "runner-control.json")["cases"]


def evaluate(slot, records, review):
    control = controls[slot["subject"]]
    arm = control["arms"][slot["arm"]]
    starts = [r for r in records if r["event"] == "attempt-started"]
    finishes = [r for r in records if r["event"] == "attempt-finished"]
    results = [r for r in records if r["event"] == "result"]
    assert len(finishes) <= len(starts) <= 1 and len(results) <= 1
    if not results:
        return {**slot, "attempts": len(starts), "outcome": "aborted", "correct": False}
    result, = results
    assert records[-1] == result and not result["writeAttempts"]
    assert all(result[k] == v for k, v in control["identity"].items())
    if starts:
        assert len(finishes) == 1
        assert result["sent"] == starts[0]["sent"] and result["fact"] == finishes[0]["fact"]
        assert result["sent"] == {**arm["message"], "deadline": plan["callMs"]}
        fact = result["fact"]
        if fact["outcome"] == "completed" and (result["failure"] or {}).get("code") != "session-identity":
            assert all(fact[k] == result["sent"][k] for k in ("promptSha256", "schemaSha256"))
    else:
        assert result["sent"] is None and result["fact"] is None
    usage = (result["fact"] or {}).get("usage")
    metered = usage and all(type(usage.get(key)) is int and usage[key] >= 0 for key in ("input_tokens", "output_tokens"))
    within = metered and usage["input_tokens"] <= plan["inputTokens"] and usage["output_tokens"] <= plan["outputTokens"]         and result["wallMs"] <= plan["caseMs"]
    budget = "unknown" if not metered else "within" if within else "exceeded"
    assert result["budget"] == budget
    rejected = [r["failure"] for r in records if r["event"] == "rejected"]
    assert rejected == ([result["failure"]] if result["failure"] else [])
    answer = result["answer"]
    cited, coverage = [], {}
    execution_cited = False
    if answer:
        assert not result["failure"] and all(answer[k] == v for k, v in control["identity"].items())
        aliases = result["sent"]["aliases"]
        assert answer["receiptIds"] == [aliases[alias] for alias in answer["citations"]]
        assert len(set(answer["receiptIds"])) == len(answer["receiptIds"])
        proof_by_id = {p["id"]: p for p in arm["sources"]}
        cited = [proof_by_id[rid] for rid in answer["receiptIds"]]
        coverage = lifecycle.links(slot["subject"], cited)
        coverage["csf-definition"] = {10, 12} <= lifecycle.complete.baseline.lines(cited, "stories/button.stories.ts")
        execution_cited = any(p["kind"] == "execution" for p in cited)
        if slot["arm"] == "execution":
            coverage["execution-observation"] = execution_cited
        else:
            assert not execution_cited
        if review:
            assert review["reasonSha256"] == sha256(answer["reason"].encode()).hexdigest()
            assert type(review["passes"]) is bool and review["note"].strip()
    expected = "refuted" if slot["subject"] == "original" else "confirmed"
    verdict = answer["verdict"] if answer else None
    if result["failure"]:
        outcome = "contract-rejection" if result["failure"]["stage"] == "verdict" else "technical-failure"
    elif verdict == "inconclusive":
        outcome = "valid-inconclusive"
    elif verdict != expected:
        outcome = "judgment-error"
    elif not all(coverage.values()):
        outcome = "unsupported-citations"
    elif review is None:
        outcome = "awaiting-causal-review"
    elif not review["passes"]:
        outcome = "unsupported-explanation"
    elif budget != "within":
        outcome = "budget-" + budget
    else:
        outcome = "correct"
    return {**slot, "attempts": len(starts), "outcome": outcome, "correct": outcome == "correct", "expected": expected,
            "verdict": verdict, "coverage": coverage, "executionCited": execution_cited,
            "receiptIds": [p["id"] for p in cited], "reason": answer["reason"] if answer else None,
            "missing": answer["missing"] if answer else None, "review": review, "failure": result["failure"],
            "anchor": result["anchor"], "budget": budget, "usage": usage, "wallMs": result["wallMs"]}


def score(ledger, reviews=None):
    header, *entries = [json.loads(line) for line in ledger.read_text().splitlines()]
    assert header["event"] == "plan" and header["slots"] == slots
    assert header["controls"] == {subject: {arm: row["message"] for arm, row in case["arms"].items()}
                                  for subject, case in controls.items()}
    grouped = defaultdict(list)
    for entry in entries:
        grouped[entry["trial"]].append(entry)
    assert set(grouped) <= {s["trial"] for s in slots}
    for slot in slots:
        assert all(all(e[k] == v for k, v in slot.items()) for e in grouped[slot["trial"]])
    notes = read(reviews) if reviews else {}
    if reviews:
        assert set(notes) == {r["trial"] for r in entries if r["event"] == "result" and r["answer"]}
    trials = [evaluate(s, grouped[s["trial"]], notes.get(s["trial"])) for s in slots]
    correct = {arm: {subject: sum(r["correct"] for r in trials if r["arm"] == arm and r["subject"] == subject)
                     for subject in plan["subjects"]} for arm in plan["arms"]}
    return {"freeze": header["freeze"], "attempts": sum(r["attempts"] for r in trials), "writeAttempts": 0,
            "correct": correct, "executionPasses": all(n == 3 for n in correct["execution"].values()), "trials": trials}


if __name__ == "__main__":
    print(json.dumps(score(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None), indent=2))
