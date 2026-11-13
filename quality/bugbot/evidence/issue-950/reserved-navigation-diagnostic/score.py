"""Score reserved #892 slots against independent evaluator facts."""
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / "manifest.json").read_text())
ORACLE = json.loads((ROOT / "oracle.json").read_text())
CONTROL = json.loads((ROOT / "runner-control.json").read_text())
CAP = PLAN["ceiling"]
PACKET = PLAN["packetCeiling"]
SOURCE = {"elapsedMs": "sourceMs", "sourceBytes": "sourceBytes", "openedFiles": "openedFiles",
          "treeEntries": "treeEntries", "matches": "matches", "evidenceBytes": "evidenceBytes"}


def load(path):
    plan, *events = map(json.loads, path.read_text().splitlines())
    assert plan["event"] == "plan" and plan["rows"] == PLAN["rows"] and len(plan["freeze"]) == 40
    slots = {row["trial"]: row for row in PLAN["rows"]}
    assert len(slots) == 36
    assert {(r["model"], r["subject"], r["arm"], r["repetition"]) for r in slots.values()} == {
        (m, s, a, r) for m in PLAN["models"] for s in PLAN["subjects"] for a in PLAN["arms"] for r in PLAN["repetitions"]
    }
    by_slot = defaultdict(list)
    for event in events:
        row = slots[event["trial"]]
        assert all(event[k] == v for k, v in row.items())
        by_slot[event["trial"]].append(event)
    return [score(row, by_slot[row["trial"]]) for row in PLAN["rows"]]


def score(row, events):
    oracle = ORACLE[row["subject"]]
    key = f"reserved-navigation/{row['model']}/{row['subject']}/{row['repetition']}"
    seed = CONTROL["groups"][key]
    results = [event for event in events if event["event"] == "result"]
    assert len(results) <= 1
    if not results:
        return {**row, "status": "aborted", "expected": oracle["verdict"], "stage": "aborted",
                "retrieved": False, "delivered": False, "cited": False, "exact": False, "budgetProved": False, "correct": False}
    result = results[0]
    assert result["head"] == oracle["head"] and events[-1] == result
    started = [event for event in events if event["event"] == "attempt-started"]
    finished = {event["attempt"]: event for event in events if event["event"] == "attempt-finished"}
    assert [e["attempt"] for e in started] == list(range(1, len(started) + 1))
    assert len(started) == len(finished) == len(result["calls"]) == len(result["packets"])
    if started:
        assert started[0]["round"] == 1
        assert all(started[0][k] == seed[k] for k in ("promptSha256", "promptBytes", "packetBytes"))
    assert all(e["deadline"] <= 42000 for e in started)
    for start, packet, fact in zip(started, result["packets"], result["calls"]):
        assert all(start[k] == v for k, v in packet.items())
        assert finished[start["attempt"]]["fact"] == fact
        if "promptSha256" in fact:
            assert fact["promptSha256"] == start["promptSha256"]
    lookup = result.get("lookup") or {}
    receipts = lookup.get("receipts", [])
    binding = seed["proofs"][0]
    assert all(all(proof[k] == binding[k] for k in ("operation", "candidate", "head", "tree")) for proof in receipts)
    span = oracle["decisive"]
    witnesses = {p["id"] for p in receipts if p["path"] == span["path"] and p["start"] <= span["start"] and p["end"] >= span["end"]}
    delivered = {receipt for packet in started if packet["round"] == 2
                 and (finished[packet["attempt"]]["fact"].get("turnStartedMs") is not None
                      or finished[packet["attempt"]]["fact"].get("turnCompletions", 0) > 0)
                 for receipt in packet["deliveredReceiptIds"]}
    cited = witnesses & delivered & set(result.get("citations", []))
    exact = all(result["anchor"]["selected"][k] == oracle[k] for k in ("path", "side", "line"))
    usage = lookup.get("budget", {})
    metered = result["unknown"] == 0 and bool(started)
    budget = (metered and (not receipts or all(k in usage for k in SOURCE))
              and all(usage.get(k, 0) <= PACKET[cap] for k, cap in SOURCE.items())
              and len(receipts) <= PACKET["receipts"]
              and all(e["packetBytes"] <= PACKET["packetBytes"] and e["promptBytes"] <= PACKET["promptBytes"] for e in started)
              and len(started) <= CAP["calls"] and result["wallMs"] <= CAP["caseMs"]
              and result["input"] <= CAP["grossInputTokens"] and result["output"] <= CAP["outputTokens"])
    correct = result["status"] == "completed" and result.get("verdict") == oracle["verdict"]
    stage = "passed"
    if result["status"] != "completed":
        round_number = started[-1]["round"] if started else 0
        stage = f"round-{round_number}:{result.get('reason', result['status'])}"
    elif row["arm"] == "on-demand" and not result.get("evidenceRequest"):
        stage = "no-request"
    elif row["arm"] == "on-demand" and not witnesses:
        stage = f"retrieval:{lookup.get('status', 'missing')}"
    elif row["arm"] == "on-demand" and not (witnesses & delivered):
        stage = "decisive-receipt-not-delivered"
    elif not correct:
        stage = "verdict:" + result.get("verdict", "missing")
    elif row["arm"] == "on-demand" and not cited:
        stage = "decisive-receipt-not-cited"
    elif not exact:
        stage = "anchor"
    elif not budget:
        stage = "budget"
    return {**result, "expected": oracle["verdict"], "exact": exact, "budgetProved": budget,
            "retrieved": bool(witnesses), "delivered": bool(witnesses & delivered), "cited": bool(cited),
            "correct": correct, "stage": stage}


def summarize(rows):
    profiles = {}
    for model in PLAN["models"]:
        group = [r for r in rows if r["model"] == model]
        by_arm = {arm: [r for r in group if r["arm"] == arm] for arm in PLAN["arms"]}
        counts = {arm: sum(r["correct"] and r["exact"] and r["budgetProved"] for r in subset)
                  for arm, subset in by_arm.items()}
        demand = by_arm["on-demand"]
        effects = any(r.get("writeAttempts") or any(c.get("toolTypes") or c.get("inspections") for c in r.get("calls", [])) for r in group)
        profiles[model] = {"correctExactBudget": counts,
                           "decisiveRecovered": sum(r["retrieved"] for r in demand),
                           "decisiveDelivered": sum(r["delivered"] for r in demand),
                           "decisiveCited": sum(r["cited"] for r in demand),
                           "stages": dict(Counter(r["stage"] for r in demand)),
                           "eligible": (not effects and counts["on-demand"] == 6
                                        and all(r["retrieved"] and r["delivered"] and r["cited"] for r in demand)
                                        and all(counts["on-demand"] > counts[arm] for arm in ("fixed", "repeat")))}
    return profiles


if __name__ == "__main__":
    rows = load(Path(sys.argv[1]))
    print(json.dumps({"profiles": summarize(rows), "rows": rows}, indent=2))
