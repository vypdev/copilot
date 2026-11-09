"""Score the known-case complete-packet control after the calls."""
from collections import defaultdict
import json
from pathlib import Path
from runpy import run_path
import sys

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / "manifest.json").read_text())
CONTROL = json.loads((ROOT / "runner-control.json").read_text())["cases"]
reference = run_path(str(ROOT.parent / "detector-verifier-diagnostic" / "score.py"))
ORACLE = reference["ORACLE"]
coverage = reference["coverage"]
LINKS = {"drag": "drag", "fresh-click": "freshClick", "dispatch": "dispatch"}
CAP = PLAN["ceiling"]
PACKET = PLAN["packetCeiling"]


def score(slot, events):
    control = CONTROL[slot["subject"]]
    oracle = ORACLE[slot["subject"]]
    started = [e for e in events if e["event"] == "attempt-started"]
    finished = [e for e in events if e["event"] == "attempt-finished"]
    results = [e for e in events if e["event"] == "result"]
    assert len(results) <= 1 and len(finished) <= len(started) <= 1
    if started:
        assert all(started[0][key] == control[key] for key in
                   ("promptSha256", "schemaSha256", "packetSha256", "promptBytes", "packetBytes", "citations"))
        assert 0 < started[0]["deadline"] <= PLAN["verifier"]["callMs"]
    if not results:
        return {**slot, "status": "aborted", "valid": False, "correct": False, "usage": None}
    result = results[0]
    assert events[-1] == result
    assert len(started) == len(finished) == (result["fact"] is not None)
    assert result["writeAttempts"] == []
    assert result["evidence"] == control["sources"]
    identity = ("head", "tree", "candidate", "operation", "anchor")
    assert all(result[key] == control[key] for key in identity)
    fact = result["fact"] or {}
    if started:
        assert all(started[0][key] == val for key, val in result["sent"].items())
        assert finished[0]["fact"] == fact
    usage = fact.get("usage")
    metered = usage is not None and all(type(usage.get(key)) is int and usage[key] >= 0
                                        for key in ("input_tokens", "output_tokens"))
    budget = "unknown"
    if metered:
        within = (len(started) == 1 and result["wallMs"] <= CAP["caseMs"]
                  and usage["input_tokens"] <= CAP["grossInputTokens"] and usage["output_tokens"] <= CAP["outputTokens"]
                  and result["sent"]["packetBytes"] <= PACKET["packetBytes"]
                  and result["sent"]["promptBytes"] <= PACKET["promptBytes"])
        budget = "within" if within else "exceeded"
    assert result["budget"] == budget
    delivered = (fact.get("turnStartedMs") is not None or fact.get("turnCompletions", 0) > 0)
    delivery = coverage(result["evidence"] if delivered else [])
    answer = result["answer"]
    cited = answer["receiptIds"] if answer else []
    citation = coverage(p for p in result["evidence"] if p["id"] in cited)
    failure = result["failure"]
    raw = answer["verdict"] if answer else None
    exact_anchor = None
    if answer:
        assert all(answer[key] == control[key] for key in identity)
        assert all(fact[key] == control[key] for key in ("promptSha256", "schemaSha256"))
        assert not fact["toolTypes"] and not fact["inspections"] and fact["turnCompletions"] == 1
        assert len(set(cited)) == len(cited) and all(control["citations"][alias] == id_
                                                    for alias, id_ in zip(answer["citations"], cited, strict=True))
        assert delivered and failure is None
        exact_anchor = answer["anchor"] == control["anchor"]
    gaps = [link for link, key in LINKS.items() if not (delivery[link] and citation[link])
            or (answer and answer["links"][key] == "unknown")]
    correct = False
    if not answer:
        code = failure["code"]
        if code == "provider-turn-timeout":
            status = "expired"
        elif code == "provider-json-invalid" or code.startswith(("response-", "citation-", "receipt-", "session-identity")):
            status = "contract-rejection"
        else:
            status = "execution-failure"
    elif raw == "inconclusive":
        status = "valid-inconclusive"
    elif gaps:
        status = "unsupported-conclusive"
    elif raw != oracle["verdict"] or answer["links"] != oracle["links"]:
        status = "judgment-error"
    elif budget != "within":
        status = "budget-unproven" if budget == "unknown" else "budget-exceeded"
    else:
        status = "correct"
        correct = exact_anchor
    return {**slot, "status": status, "valid": answer is not None, "correct": bool(correct), "expected": oracle["verdict"],
            "verdict": raw, "reason": answer["reason"] if answer else None, "missing": answer["missing"] if answer else None,
            "links": answer["links"] if answer else None, "aliases": answer["citations"] if answer else [],
            "failure": failure, "delivery": delivery, "citation": citation, "gaps": gaps, "exactAnchor": exact_anchor,
            "budget": budget, "usage": usage, "wallMs": result["wallMs"], "attempted": len(started), "writeAttempts": 0}


def main(file):
    header, *entries = [json.loads(line) for line in file.read_text().splitlines()]
    assert header["event"] == "plan" and header["slots"] == PLAN["slots"]
    assert header["hashes"] == {subject: {key: case[key] for key in ("promptSha256", "schemaSha256", "packetSha256")}
                               for subject, case in CONTROL.items()}
    order = [e["trial"] for e in entries if e["event"] == "attempt-started"]
    assert order == [row["trial"] for row in PLAN["slots"] if row["trial"] in order]
    grouped = defaultdict(list)
    for entry in entries:
        grouped[entry["trial"]].append(entry)
    assert set(grouped) <= {row["trial"] for row in PLAN["slots"]}
    scored = [score(slot, grouped[slot["trial"]]) for slot in PLAN["slots"]]
    profiles = {model: all(row["correct"] for row in scored if row["model"] == model) for model in PLAN["verifier"]["models"]}
    print(json.dumps({"freeze": header["freeze"], "profiles": profiles, "trials": scored}, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
