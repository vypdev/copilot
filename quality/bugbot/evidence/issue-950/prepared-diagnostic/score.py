"""Score this prepared-context diagnostic without passing oracle data to the runner."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ORDER = json.loads((ROOT / "order.json").read_text())
PACKETS = json.loads((ROOT / "packets.json").read_text())
ORACLE = json.loads((ROOT / "oracle.json").read_text())
PLAN = json.loads((ROOT / "manifest.json").read_text())
CAP = PLAN["ceiling"]


def covers(item, source):
    return item["path"] == source["path"] and any(
        span["start"] <= source["start"] and span["end"] >= source["end"]
        for span in item.get("ranges", [item])
    )


def evaluate(result):
    subject = result["subject"]
    oracle = ORACLE[subject]
    revision = PACKETS[subject]
    packet = revision[result["arm"]]
    if result["status"] != "aborted":
        for field in ("packetBytes", "promptBytes", "promptSha256", "schemaSha256"):
            assert result[field] == packet[field]
        assert result["head"] == oracle["head"] and result["tree"] == oracle["tree"]
    anchor = result.get("anchor", {})
    exact = all(anchor.get(key) == oracle[key] for key in ("path", "side", "line"))
    supplied = {item["id"] for item in packet["receipts"]}
    historical = {item["id"] for item in revision["historical"]["receipts"]}
    citations = set(result.get("citations", []))
    assert citations <= supplied
    decisive = {item["id"] for item in packet["receipts"]
                if item["id"] in citations and item["head"] == oracle["head"] and item["tree"] == oracle["tree"]
                and covers(item, oracle["decisive"])}
    usage = (result.get("fact") or {}).get("usage")
    metered = bool(usage and usage["input"] <= CAP["grossInputTokens"] and usage["output"] <= CAP["outputTokens"]
                   and result["wallMs"] <= CAP["caseMs"] and result["packetBytes"] <= CAP["packetBytes"]
                   and result["promptBytes"] <= CAP["promptBytes"])
    correct = result["status"] == "completed" and result.get("verdict") == oracle["verdict"]
    return {**result, "expected": oracle["verdict"], "exact": exact, "correct": correct, "budgetProved": metered,
            "decisiveCited": sorted(decisive), "preparedCited": sorted(citations - historical),
            "supportedCorrect": bool(correct and exact and decisive and metered and not result.get("writeAttempts"))}


def score(path):
    events = [json.loads(line) for line in path.read_text().splitlines()]
    assert events[0]["event"] == "plan" and events[0]["rows"] == ORDER and len(events[0]["freeze"]) == 40
    assert len(ORDER) == PLAN["plannedTrials"] == len({row["trial"] for row in ORDER})
    planned = {row["trial"]: row for row in ORDER}
    started, results = set(), {}
    for event in events[1:]:
        key = event["trial"]
        assert all(event[name] == value for name, value in planned[key].items())
        if event["event"] == "attempt-started":
            assert key not in started and event["round"] == 2 and event["attempt"] == 1
            assert event["promptSha256"] == PACKETS[event["subject"]][event["arm"]]["promptSha256"]
            started.add(key)
        else:
            assert event["event"] == "result" and key in started and key not in results
            results[key] = event
    return [evaluate(results.get(slot["trial"], {**slot, "status": "aborted"})) for slot in ORDER]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("journal", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    results = score(args.journal)
    if args.json:
        args.json.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"slots": len(results), "terminal": sum(row["status"] != "aborted" for row in results)}))
