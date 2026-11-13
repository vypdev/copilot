"""Compare the six automatic second calls with the six frozen prepared calls."""
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parent
PROTOCOL = json.loads((ROOT / "manifest.json").read_text())
PACKETS = json.loads((ROOT / "packets.json").read_text())
REFERENCE = ROOT.parent / "prepared-diagnostic"
SCORER = runpy.run_path(str(REFERENCE / "score.py"))
ORACLE = SCORER["ORACLE"]


def read_run(path):
    plan, *events = map(json.loads, path.read_text().splitlines())
    assert plan["event"] == "plan" and plan["rows"] == PROTOCOL["rows"]
    assert len(plan["freeze"]) == 40 and len(events) == 12
    slots = {row["trial"]: row for row in plan["rows"]}
    started, completed = set(), {}
    for event in events:
        key = event["trial"]
        row = slots[key]
        assert all(event[name] == value for name, value in row.items())
        packet = PACKETS[row["subject"]]["automatic"]
        oracle = ORACLE[row["subject"]]
        assert event["head"] == oracle["head"] and event["tree"] == oracle["tree"]
        for field in ("packetBytes", "promptBytes", "promptSha256", "schemaSha256"):
            assert event[field] == packet[field]
        if event["event"] == "attempt-started":
            assert key not in started and event["round"] == 2 and event["attempt"] == 1
            assert event["deadlineMs"] == PROTOCOL["ceiling"]["callMs"]
            started.add(key)
        else:
            assert event["event"] == "result" and key in started and key not in completed
            completed[key] = event
    assert len(started) == len(completed) == len(slots) == 6
    return completed


def score_automatic(result):
    oracle = ORACLE[result["subject"]]
    packet = PACKETS[result["subject"]]["automatic"]
    proofs = {item["id"]: item for item in packet["receipts"]}
    citations = set(result.get("citations", []))
    assert citations <= proofs.keys()
    decisive = sorted(item for item in citations if SCORER["covers"](proofs[item], oracle["decisive"]))
    exact = all(result["anchor"].get(key) == oracle[key] for key in ("path", "side", "line"))
    usage = result["fact"]["usage"]
    limits = PROTOCOL["ceiling"]
    budget = bool(usage and 0 <= usage["input"] <= limits["grossInputTokens"]
                  and 0 <= usage["output"] <= limits["outputTokens"]
                  and result["wallMs"] <= limits["caseMs"] and result["packetBytes"] <= limits["packetBytes"]
                  and result["promptBytes"] <= limits["promptBytes"])
    verdict = result["status"] == "completed" and result.get("verdict") == oracle["verdict"]
    return {**result, "expected": oracle["verdict"], "exact": exact, "decisiveCited": decisive,
            "budgetProved": budget, "supportedCorrect": bool(verdict and exact and decisive and budget and not result["writeAttempts"])}


def compare(path):
    completed = read_run(path)
    prepared = {row["trial"]: row for row in SCORER["score"](REFERENCE / "trials.jsonl")}
    rows = []
    for row in PROTOCOL["rows"]:
        ref = prepared[row["referenceTrial"]]
        assert ref["arm"] == "complete" and ref["model"] == row["model"]
        assert ref["subject"] == row["subject"] and ref["repetition"] == row["repetition"]
        rows.append({"prepared": ref, "automatic": score_automatic(completed[row["trial"]])})
    return rows


if __name__ == "__main__":
    print(json.dumps(compare(Path(sys.argv[1])), ensure_ascii=False, indent=2))
