"""Evaluate the fixed #892 packet with the viewport identity requirement."""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
from runpy import run_path
import sys

ROOT = Path(__file__).resolve().parent
HISTORICAL = ROOT.parent / "complete-verdict-diagnostic"
REFERENCE = run_path(str(ROOT.parent / "detector-verifier-diagnostic" / "score.py"))
ORACLE = REFERENCE["ORACLE"]
PLAN = json.loads((ROOT / "manifest.json").read_text())
CAPS = json.loads((HISTORICAL / "manifest.json").read_text())
CONTROL = json.loads((ROOT / "runner-control.json").read_text())
OLD = json.loads((HISTORICAL / "runner-control.json").read_text())["cases"]
IDENTITY = ("head", "tree", "candidate", "operation", "anchor")
HASHES = ("promptSha256", "schemaSha256", "packetSha256")
PACKET = (*HASHES, "packetBytes", "promptBytes", "citations")


def coverage(proofs):
    proofs = list(proofs)
    covered = REFERENCE["coverage"](proofs)
    lines = defaultdict(set)
    for proof in proofs:
        lines[proof["path"]].update(range(proof["start"], proof["end"] + 1))
    covered["viewport-identity"] = set(range(21, 26)) <= lines[ORACLE["paths"]["overflow"]]
    covered["rendered-in-bar"] = {108, 109, 110, 111, 115, 116, 117, 118, 119} <= lines[ORACLE["paths"]["tabs"]]
    return covered


def control():
    for subject, case in CONTROL.items():
        old, new = (coverage(x["sources"]) for x in (OLD[subject], case))
        assert old == {**new, "viewport-identity": False} and all(new.values())
        assert old["fresh-click"] and old["dispatch"] and old["rendered-in-bar"]
        assert not coverage(p for p in case["sources"] if p["alias"] != "S1")["viewport-identity"]
        assert not coverage(p for p in case["sources"] if p["alias"] != "S4")["rendered-in-bar"]
        assert case["sources"][1:] == OLD[subject]["sources"][1:]
    print("Historical packet misses viewport identity despite covering the listener and handler. Both expanded packets cover all required ranges.")


def score(slot, events, audit):
    case = CONTROL[slot["subject"]]
    oracle = ORACLE[slot["subject"]]
    names = [event["event"] for event in events]
    assert names in ([], ["result"], ["attempt-started"], ["attempt-started", "attempt-finished"],
                     ["attempt-started", "attempt-finished", "result"])
    started = bool(events) and names[0] == "attempt-started"
    row = {**slot, "expected": oracle["verdict"], "attempted": int(started), "status": "aborted", "correct": False}
    if started:
        assert all(events[0][key] == case[key] for key in PACKET)
        assert 0 < events[0]["deadline"] <= CAPS["verifier"]["callMs"]
    if "result" not in names:
        return row
    result = events[-1]
    assert all(result[key] == case[key] for key in IDENTITY)
    assert result["evidence"] == case["sources"] and not result["writeAttempts"]
    if started:
        assert all(events[0][key] == value for key, value in result["sent"].items())
        assert events[1]["fact"] == result["fact"]
    answer, failure = result["answer"], result["failure"]
    fact = result["fact"] or {}
    usage = fact.get("usage")
    limits = CAPS["ceiling"]
    metered = usage is not None and all(type(usage.get(key)) is int and usage[key] >= 0
                                        for key in ("input_tokens", "output_tokens"))
    within = (started and metered and result["wallMs"] <= limits["caseMs"]
              and usage["input_tokens"] <= limits["grossInputTokens"] and usage["output_tokens"] <= limits["outputTokens"]
              and all(case[key] <= CAPS["packetCeiling"][key] for key in ("packetBytes", "promptBytes")))
    budget = "unknown" if not metered else "within" if within else "exceeded"
    assert result["budget"] == budget
    delivered = fact.get("turnStartedMs") is not None or fact.get("turnCompletions", 0) > 0
    delivery = coverage(result["evidence"] if delivered else [])
    cited = answer["receiptIds"] if answer else []
    citation = coverage(p for p in result["evidence"] if p["id"] in cited)
    gaps = [link for link in citation if not (citation[link] and delivery[link])]
    verdict = answer["verdict"] if answer else None
    causal = None
    if answer:
        assert failure is None and delivered and all(answer[key] == case[key] for key in IDENTITY)
        assert all(fact[key] == case[key] for key in ("promptSha256", "schemaSha256"))
        assert fact["turnCompletions"] == 1 and not fact["toolTypes"] and not fact["inspections"]
        assert len(set(cited)) == len(cited)
        assert cited == [case["citations"][alias] for alias in answer["citations"]]
        if audit:
            assert audit["reasonSha256"] == sha256(answer["reason"].encode()).hexdigest()
            assert type(audit["passes"]) is bool and audit["note"].strip()
            causal = audit["passes"]

    if not answer:
        status = failure["code"]
    elif verdict == "inconclusive":
        status = "valid-inconclusive"
    elif gaps:
        status = "unsupported-conclusive"
    elif verdict != oracle["verdict"] or answer["links"] != oracle["links"]:
        status = "judgment-error"
    elif not within:
        status = "budget-" + budget
    elif causal is None:
        status = "awaiting-causal-review"
    elif not causal:
        status = "causal-explanation"
    else:
        status = "correct"
    return {**row, "status": status, "correct": status == "correct", "verdict": verdict, "valid": answer is not None,
            "reason": answer["reason"] if answer else None, "missing": answer["missing"] if answer else None,
            "links": answer["links"] if answer else None, "aliases": answer["citations"] if answer else [],
            "failure": failure, "delivery": delivery, "citation": citation, "gaps": gaps,
            "anchor": result["anchor"], "budget": budget, "usage": usage, "wallMs": result["wallMs"],
            "writeAttempts": result["writeAttempts"], "causalReview": audit}


def main(file, audit_file):
    header, *events = [json.loads(line) for line in file.read_text().splitlines()]
    assert header["event"] == "plan" and header["slots"] == PLAN["slots"]
    assert header["hashes"] == {subject: {key: case[key] for key in HASHES} for subject, case in CONTROL.items()}
    grouped = defaultdict(list)
    for event in events:
        grouped[event["trial"]].append(event)
    order = [slot["trial"] for slot in PLAN["slots"]]
    assert list(grouped) == [trial for trial in order if trial in grouped]
    for slot in PLAN["slots"]:
        assert all(all(event[key] == val for key, val in slot.items()) for event in grouped[slot["trial"]])
    audit = json.loads(audit_file.read_text()) if audit_file else {}
    if audit_file:
        assert set(audit) == {event["trial"] for event in events if event["event"] == "result" and event["answer"]}
    trials = [score(slot, grouped[slot["trial"]], audit.get(slot["trial"])) for slot in PLAN["slots"]]
    print(json.dumps({"freeze": header["freeze"], "passes": all(row["correct"] for row in trials), "trials": trials}, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["--control"]:
        control()
    else:
        main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None)
