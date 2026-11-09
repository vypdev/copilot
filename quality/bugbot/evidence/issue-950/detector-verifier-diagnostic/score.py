"""Audit the detector/verifier experiment without sending the oracle to a model."""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / "manifest.json").read_text())
ORACLE = json.loads((ROOT / "oracle.json").read_text())
CONTROL = json.loads((ROOT / "runner-control.json").read_text())
CAP = PLAN["ceiling"]
PACKET = PLAN["packetCeiling"]


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def coverage(proofs):
    by_path = defaultdict(set)
    for proof in proofs:
        by_path[proof["path"]].update(range(proof["start"], proof["end"] + 1))
    return {link: all(set(range(first, last + 1)) <= by_path[ORACLE["paths"][name]]
                      for name, first, last in spans) for link, spans in ORACLE["ranges"].items()}


def evaluate(slot, events, frozen):
    results = [e for e in events if e["event"] == "result"]
    assert len(results) <= 1
    if not results:
        return {**slot, "origin": frozen["origin"], "status": "aborted", "correct": False}
    result = results[0]
    assert events[-1] == result
    assert result["origin"] == frozen["origin"] and result["candidate"] == frozen["hypothesis"]["id"]
    subject = slot["subject"]
    pinned = CONTROL["detector"][subject]
    assert (result["head"], result["tree"], result["base"]) == (pinned["head"], pinned["tree"], pinned["base"])
    started = [e for e in events if e["event"] == "attempt-started"]
    finished = [e for e in events if e["event"] == "attempt-finished"]
    reads = [e for e in events if e["event"] == "read"]
    assert len(started) == len(finished) == len(result["calls"]) == len(result["packets"])
    assert len(reads) == len(result["reads"]) <= PLAN["verifier"]["readRounds"]
    assert all(e["response"] == record for e, record in zip(reads, result["reads"]))
    for i, (a, b, fact, packet) in enumerate(zip(started, finished, result["calls"], result["packets"]), 1):
        assert a["call"] == b["call"] == i and b["fact"] == fact and all(a[k] == v for k, v in packet.items())
        assert a["deadline"] <= PLAN["verifier"]["callMs"]
        if "promptSha256" in fact:
            assert fact["promptSha256"] == a["promptSha256"]
    proofs = {proof["id"]: proof for proof in result["evidence"]}
    assert len(proofs) == len(result["evidence"])
    assert len({p["operation"] for p in proofs.values()}) == 1
    allowed = {(pinned["head"], pinned["tree"])}
    if frozen["hypothesis"]["regression"]:
        allowed.add((pinned["base"], pinned["baseTree"]))
    assert all(p["candidate"] == result["candidate"] and (p["head"], p["tree"]) in allowed for p in proofs.values())
    delivered = {id_ for a, fact in zip(started, result["calls"])
                 if fact.get("turnStartedMs") is not None or fact.get("turnCompletions", 0)
                 for id_ in a["receiptIds"]}
    cited = set(result.get("citations", []))
    assert cited <= delivered <= proofs.keys()
    # A base receipt can show a comparison. It cannot establish execution on the reviewed head.
    source = [p for p in proofs.values() if p["kind"] == "git" and p["head"] == pinned["head"]]
    delivery = coverage(p for p in source if p["id"] in delivered)
    citation = coverage(p for p in source if p["id"] in cited)
    calls = result["calls"]
    metered = bool(calls) and all(isinstance((call.get("usage") or {}).get(key), int)
                                  and call["usage"][key] >= 0 for call in calls for key in ("input_tokens", "output_tokens"))
    totals = {key: sum((c.get("usage") or {}).get(key) or 0 for c in calls)
              for key in ("input_tokens", "output_tokens", "cached_input_tokens")}
    limits = {"treeEntries": "treeEntries", "openedFiles": "openedFiles", "matches": "matches",
              "evidenceBytes": "evidenceBytes", "sourceBytes": "sourceBytes", "elapsedMs": "sourceMs", "receipts": "receipts"}
    source_usage = result["sourceUsage"]
    budget = (metered and source_usage["accounted"] and len(calls) <= CAP["calls"] and result["wallMs"] <= CAP["caseMs"]
              and totals["input_tokens"] <= CAP["grossInputTokens"] and totals["output_tokens"] <= CAP["outputTokens"]
              and all(source_usage[key] <= PACKET[cap] for key, cap in limits.items())
              and all(p["promptBytes"] <= PACKET["promptBytes"] and p["packetBytes"] <= PACKET["packetBytes"] for p in started))
    exact = result["anchor"] == frozen["hypothesis"]["anchor"]
    clean = not result["writeAttempts"] and not any(c.get("toolTypes") or c.get("inspections") for c in calls)
    raw = result.get("verdict")
    gaps = [link for link in delivery if not (delivery[link] and citation[link])]
    effective = raw or result["status"]
    if raw in ("confirmed", "refuted") and gaps:
        effective = "inconclusive"
    correct = (result["status"] == "completed" and effective == ORACLE[subject]["verdict"]
               and result["links"] == ORACLE[subject]["links"] and exact and budget and clean)
    return {**result, "expected": ORACLE[subject]["verdict"], "effective": effective, "delivered": delivery, "cited": citation,
            "gaps": gaps, "exact": exact, "budgetProved": budget, "correct": correct, "totals": totals,
            "realDefectRejected": subject == "N2" and raw == "refuted"}


def score(directory):
    frozen_bytes = (directory / "candidates.json").read_bytes()
    freeze = json.loads(frozen_bytes)
    detection = read_jsonl(directory / "detection.jsonl")
    assert len(detection) == 4
    for i, subject in enumerate(PLAN["subjects"]):
        start, result = detection[i * 2:i * 2 + 2]
        assert start["event"] == "detector-started" and start["attempt"] == 1 and result["event"] == "detector-result"
        assert start["subject"] == result["subject"] == subject and result["model"] == PLAN["detector"]["model"]
        assert all(start[k] == v for k, v in CONTROL["detector"][subject].items())
    plan, *events = read_jsonl(directory / "trials.jsonl")
    assert plan["event"] == "plan" and plan["slots"] == PLAN["slots"] and plan["freeze"] == freeze["freeze"]
    assert plan["candidatesSha256"] == sha256(frozen_bytes).hexdigest()
    slots = {s["trial"]: s for s in PLAN["slots"]}
    assert len(slots) == 12
    assert {(s["subject"], s["model"], s["repetition"]) for s in slots.values()} == {
        (subject, model, rep) for subject in PLAN["subjects"] for model in PLAN["verifier"]["models"] for rep in (1, 2, 3)
    }
    grouped = defaultdict(list)
    initial = defaultdict(set)
    for event in events:
        slot = slots[event["trial"]]
        assert all(event[key] == value for key, value in slot.items())
        grouped[slot["trial"]].append(event)
        if event["event"] == "attempt-started" and event["call"] == 1:
            initial[slot["subject"], slot["mode"]].add(event["promptSha256"])
    assert all(len(hashes) == 1 for hashes in initial.values())
    rows = [evaluate(s, grouped[s["trial"]], freeze["candidates"][s["subject"]]) for s in PLAN["slots"]]
    return {"detection": detection[1::2], "candidates": freeze["candidates"], "rows": rows}


if __name__ == "__main__":
    print(json.dumps(score(Path(sys.argv[1])), indent=2))
