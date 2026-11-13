"""Audit #892 evidence retrieval, transport, citations and causal decisions separately."""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
from runpy import run_path
import sys

ROOT = Path(__file__).resolve().parent
REFERENCE = run_path(str(ROOT.parent / "viewport-sol-diagnostic" / "score.py"))
ORACLE = REFERENCE["ORACLE"]
CONTROL = json.loads((ROOT / "runner-control.json").read_text())
PLAN = json.loads((ROOT / "manifest.json").read_text())
CAPS = json.loads((ROOT.parent / "complete-verdict-diagnostic" / "manifest.json").read_text())
SOURCE_CAPS = json.loads((ROOT.parent / "detector-verifier-diagnostic" / "manifest.json").read_text())["packetCeiling"]
KEYS = ("candidate", "head", "tree", "operation")


def coverage(proofs):
    return REFERENCE["coverage"](proofs)


def viewport_link(proofs):
    lines = {line for proof in proofs if proof["path"] == ORACLE["paths"]["overflow"]
             for line in range(proof["start"], proof["end"] + 1)}
    return {"selection": set(range(21, 26)) <= lines, "listener": set(range(26, 30)) <= lines}


def evaluate(slot, events, audit):
    case = CONTROL["cases"][slot["subject"]]
    oracle = ORACLE[slot["subject"]]
    started = [event for event in events if event["event"] == "attempt-started"]
    finished = [event for event in events if event["event"] == "attempt-finished"]
    requests = [event for event in events if event["event"] == "request"]
    lookups = [event for event in events if event["event"] == "lookup"]
    results = [event for event in events if event["event"] == "result"]
    assert len(results) <= 1 and len(requests) <= 1 and len(lookups) <= len(requests)
    assert len(finished) <= len(started) <= (1 if slot["arm"] == "fixed" else PLAN["attemptsPerCase"])
    for index, event in enumerate(started, 1):
        assert event["call"] == index and 0 < event["sent"]["deadline"] <= CAPS["verifier"]["callMs"]
    if started:
        assert all(started[0]["sent"][key] == value for key, value in case["initial"].items())
        assert started[0]["sent"]["sources"] == case["sources"]
    if not results:
        return {**slot, "attempts": len(started), "status": "aborted", "correct": False}

    result = results[0]
    assert result == events[-1] and result["writeAttempts"] == []
    assert all(result[key] == case[key] for key in (*KEYS, "anchor"))
    assert len(result["calls"]) == len(started) == len(finished)
    if requests:
        assert requests[0]["requested"] == result["requested"]
    new = lookups[0]["newProofs"] if lookups else []
    if lookups:
        assert result["lookup"] == lookups[0]["lookup"]
    if slot["arm"] != "on-demand":
        assert not new and result["sourceUsage"]["openedFiles"] == 0

    delivered = []
    initial = {proof["id"]: proof for proof in case["sources"]}
    retrieved = {proof["id"]: proof for proof in new}
    for index, (a, b, record) in enumerate(zip(started, finished, result["calls"], strict=True), 1):
        assert a["call"] == b["call"] == record["call"] == index and a["sent"] == record["sent"] and b["fact"] == record["fact"]
        sent, fact = record["sent"], record["fact"]
        if fact.get("promptSha256") and result["failure"] != {"code": "session-identity", "field": None}:
            assert all(fact[key] == sent[key] for key in ("promptSha256", "schemaSha256"))
        assert all(sent[key] <= CAPS["packetCeiling"][key] for key in ("packetBytes", "promptBytes"))
        proofs = sent["sources"]
        assert sent["citations"] == {proof["alias"]: proof["id"] for proof in proofs}
        assert len(proofs) == len(sent["citations"]) == len(set(sent["citations"].values()))
        assert proofs[:3] == case["sources"]
        assert all(proof["id"] in retrieved and retrieved[proof["id"]] == {key: val for key, val in proof.items() if key != "alias"}
                   for proof in proofs[3:])
        assert all(all(proof[key] == case[key] for key in KEYS) for proof in proofs)
        if index == 2:
            assert requests and lookups
            assert [proof["id"] for proof in proofs[3:]] == list(dict.fromkeys(p["id"] for p in new if p["id"] not in initial))
        delivered = proofs if fact.get("turnStartedMs") is not None or fact.get("turnCompletions", 0) > 0 else []

    budget = "unknown"
    keys = ("input_tokens", "output_tokens")
    metered = finished and all(all(type((e["fact"].get("usage") or {}).get(k)) is int and e["fact"]["usage"][k] >= 0
                                   for k in keys) for e in finished)
    if metered:
        totals = {k: sum(e["fact"]["usage"][k] for e in finished) for k in keys}
        assert totals == result["totals"]
        source = result["sourceUsage"]
        source_bounds = {"elapsedMs": "sourceMs", "sourceBytes": "sourceBytes", "evidenceBytes": "evidenceBytes",
                         "openedFiles": "openedFiles", "treeEntries": "treeEntries", "matches": "matches", "receipts": "receipts"}
        budget = "within" if (result["wallMs"] <= CAPS["ceiling"]["caseMs"] and source["accounted"]
                              and all(source[key] <= SOURCE_CAPS[cap] for key, cap in source_bounds.items())
                              and totals["input_tokens"] <= CAPS["ceiling"]["grossInputTokens"]
                              and totals["output_tokens"] <= CAPS["ceiling"]["outputTokens"]) else "exceeded"
    assert budget == result["budget"]

    answer = result["answer"]
    cited = []
    causal = None
    if answer:
        assert not result["failure"] and delivered and all(answer[key] == case[key] for key in (*KEYS, "anchor"))
        aliases = {proof["alias"]: proof["id"] for proof in delivered}
        assert answer["receiptIds"] == [aliases[alias] for alias in answer["citations"]]
        assert len(set(answer["receiptIds"])) == len(answer["receiptIds"])
        cited = [proof for proof in delivered if proof["id"] in answer["receiptIds"]]
        if audit:
            assert audit["reasonSha256"] == sha256(answer["reason"].encode()).hexdigest()
            assert type(audit["passes"]) is bool and audit["note"].strip()
            causal = audit["passes"]
    verdict = answer["verdict"] if answer else None
    citation = coverage(cited)
    stage = {"retrieved": viewport_link(new), "delivered": viewport_link(p for p in delivered if p["id"] in retrieved),
             "cited": viewport_link(p for p in cited if p["id"] in retrieved)}
    if result["failure"]:
        status = result["failure"]["code"]
    elif verdict is None:
        status = "unresolved-request"
    elif verdict == "inconclusive":
        status = "valid-inconclusive"
    elif not all(citation.values()) or not all(viewport_link(cited).values()):
        status = "unsupported-conclusive"
    elif verdict != oracle["verdict"] or answer["links"] != oracle["links"]:
        status = "judgment-error"
    elif budget != "within":
        status = "budget-" + budget
    elif causal is None:
        status = "awaiting-causal-review"
    elif not causal:
        status = "causal-explanation"
    else:
        status = "correct"

    stop = next((name for name, checks in stage.items() if not all(checks.values())), None)
    if stop == "retrieved" and not result["requested"]:
        stop = "request"
    if stop == "retrieved" and requests and requests[0]["admission"]["status"] != "admitted":
        stop = "request-admission"
    if stop is None and status != "correct":
        stop = "verdict"
    return {**slot, "attempts": len(started), "requested": result["requested"], "lookup": result["lookup"],
            "retrievedProofs": new, "delivered": [p["id"] for p in delivered], "cited": [p["id"] for p in cited],
            "stage": stage, "stop": stop, "citation": citation, "valid": answer is not None, "verdict": verdict,
            "expected": oracle["verdict"], "status": status, "correct": status == "correct",
            "reason": answer["reason"] if answer else None, "missing": answer["missing"] if answer else None,
            "anchor": result["anchor"], "wallMs": result["wallMs"], "budget": budget, "usage": result["totals"],
            "sourceUsage": result["sourceUsage"], "writeAttempts": result["writeAttempts"], "causalReview": audit}


def main(file, audit_file):
    header, *events = [json.loads(line) for line in file.read_text().splitlines()]
    assert header["event"] == "plan" and header["slots"] == CONTROL["slots"]
    assert header["initial"] == {subject: row["initial"] for subject, row in CONTROL["cases"].items()}
    grouped = defaultdict(list)
    for event in events:
        grouped[event["trial"]].append(event)
    order = [slot["trial"] for slot in CONTROL["slots"]]
    assert list(grouped) == [trial for trial in order if trial in grouped]
    for slot in CONTROL["slots"]:
        assert all(all(event[key] == val for key, val in slot.items()) for event in grouped[slot["trial"]])
    audit = json.loads(audit_file.read_text()) if audit_file else {}
    if audit_file:
        assert set(audit) == {e["trial"] for e in events if e["event"] == "result" and e["answer"]}
    trials = [evaluate(slot, grouped[slot["trial"]], audit.get(slot["trial"])) for slot in CONTROL["slots"]]
    demand = [row for row in trials if row["arm"] == "on-demand"]
    passes = len(demand) == 6 and all(row["correct"] and row["stop"] is None for row in demand)
    print(json.dumps({"freeze": header["freeze"], "passes": passes, "trials": trials}, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None)
