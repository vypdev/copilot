"""Score the frozen diagnostic. The trial runner never loads the oracle."""
import argparse
from collections import defaultdict
import json
from math import ceil
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAN = json.loads((HERE / "manifest.json").read_text())
ORACLE = json.loads((HERE / "oracle.json").read_text())


def score(row):
    oracle = ORACLE[row["subject"]]
    anchor = row.get("anchor", {}).get("selected") or {}
    lookup = row.get("lookup", {})
    loc = oracle["decisive"]
    exact = (anchor.get("path"), anchor.get("line"), anchor.get("side")) == (oracle["path"], oracle["line"], oracle["side"])
    witnesses = [receipt for receipt in lookup.get("receipts", [])
                 if receipt.get("head") == oracle["head"] and receipt.get("tree") == oracle["tree"]
                 and receipt.get("path") == loc["path"]
                 and any(span["start"] <= loc["start"] and span["end"] >= loc["end"]
                         for span in receipt.get("ranges", [receipt]))]
    retrieved = bool(witnesses)
    delivered_ids = {id_ for packet in row.get("packets", []) if packet["round"] == 2
                     for id_ in packet["deliveredReceiptIds"]}
    delivered = any(receipt["id"] in delivered_ids for receipt in witnesses)
    cited = any(receipt["id"] in delivered_ids and receipt["id"] in row.get("citations", []) for receipt in witnesses)
    ceiling = PLAN["packetCeiling"]
    usage = lookup.get("budget", {})
    budget = (row.get("unknown", 1) == 0 and bool(row.get("calls"))
              and all(p["packetBytes"] <= ceiling["packetBytes"] and p["promptBytes"] <= ceiling["promptBytes"]
                      for p in row.get("packets", []))
              and usage.get("elapsedMs", 0) <= ceiling["sourceMs"]
              and usage.get("sourceBytes", 0) <= ceiling["sourceBytes"]
              and usage.get("openedFiles", 0) <= ceiling["openedFiles"]
              and usage.get("treeEntries", 0) <= ceiling["treeEntries"]
              and usage.get("matches", 0) <= ceiling["matches"]
              and usage.get("evidenceBytes", 0) <= ceiling["evidenceBytes"]
              and len(lookup.get("receipts", [])) <= ceiling["receipts"] and row.get("wallMs", float("inf")) <= PLAN["ceiling"]["caseMs"]
              and row.get("input", float("inf")) <= PLAN["ceiling"]["grossInputTokens"]
              and row.get("output", float("inf")) <= PLAN["ceiling"]["outputTokens"]
              and len(row.get("calls", [])) <= PLAN["ceiling"]["calls"])
    verdict_correct = row["status"] == "completed" and row.get("verdict") == oracle["verdict"]
    correct = verdict_correct and exact
    return {**row, "exact": exact, "retrieved": retrieved, "delivered": delivered, "cited": cited, "budgetProved": budget,
            "correct": correct, "verdictCorrect": verdict_correct, "expected": oracle["verdict"]}


def load_ledger(path):
    events = [json.loads(line) for line in path.read_text().splitlines()]
    assert events[0]["event"] == "plan" and len(events[0]["freeze"]) == 40
    plan = events[0]["rows"]
    assert len(plan) == PLAN["plannedTrials"] == len({x["trial"] for x in plan})
    expected = {(m, s, a, r) for m in PLAN["models"] for s in PLAN["subjects"]
                for a in PLAN["arms"] for r in PLAN["repetitions"]}
    fields = ("model", "subject", "arm", "repetition")
    assert {tuple(row[f] for f in fields) for row in plan} == expected
    results = {}
    started = defaultdict(list)
    for event in events[1:]:
        if event["event"] == "result":
            assert event["trial"] not in results
            results[event["trial"]] = event
        elif event["event"] == "attempt-started" and event["round"] == 1 and event["attempt"] == 1:
            started[tuple(event[f] for f in ("model", "subject", "repetition"))].append(event["promptSha256"])
    assert all(len(set(hashes)) == 1 for hashes in started.values()), "initial prompt drift"
    assert set(results) <= {x["trial"] for x in plan}
    rows = []
    for planned in plan:
        row = results.get(planned["trial"], {**planned, "status": "aborted"})
        assert all(row[k] == v for k, v in planned.items())
        rows.append(score(row))
    return rows


def summarize(rows):
    report = {}
    for model in PLAN["models"]:
        held = {arm: [r for r in rows if r["model"] == model and r["arm"] == arm and r["subject"] in PLAN["heldOut"]]
                for arm in PLAN["arms"]}
        report[model] = {
            "heldOutCorrect": {arm: sum(r["correct"] and r["budgetProved"] for r in group)
                               for arm, group in held.items()},
            "heldOutDecisiveRetrieved": sum(r["retrieved"] for r in held["on-demand"]),
            "heldOutDecisiveDelivered": sum(r["delivered"] for r in held["on-demand"]),
            "heldOutDecisiveCited": sum(r["cited"] for r in held["on-demand"]),
            "eligibleForFullReviewDiagnostic": (
                not any(r.get("writeAttempts") or any(call.get("toolTypes") or call.get("inspections")
                            for call in r.get("calls", [])) for r in rows if r["model"] == model)
                and all(r["correct"] and r["cited"] and r["budgetProved"] for r in held["on-demand"])
                and all(not all(r["correct"] and r["budgetProved"] for r in held[arm]) for arm in ("fixed", "repeat"))
            ),
        }
    return report


def p95(values):
    return sorted(values)[ceil(.95 * len(values)) - 1] if values else None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("journal", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    rows = load_ledger(args.journal)
    result = {"models": summarize(rows), "rows": rows}
    if args.json:
        args.json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["models"], indent=2))
