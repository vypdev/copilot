"""Score v2 rows from a private JSONL ledger without calling the provider."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
from statistics import median
import math

root = Path(__file__).resolve().parent
cases = json.loads((root / "candidates.json").read_text())
manifest = json.loads((root / "manifest-v2.json").read_text())
patterns = {
    "U": r"surrogate|supplementary|unicode flag|utf.?16|astral",
    "F": r"fixture|expected_schema",
    "S": r"histor|restor|fixed exception|retained|source guard|excluded original",
}
positives = {"U2", "F2", "S2"}


def matches(finding, case, row):
    if row["phase"] == "frozen-replay":
        return finding["id"] == case["id"]
    return (finding.get("file") == case["path"]
            and abs((finding.get("line") or -100) - case["line"]) <= 8
            and bool(re.search(patterns[row["subject"][0]],
                               finding["title"] + " " + finding["description"], re.I)))


def scored(row):
    expected = cases[row["subject"]][0]
    positive = row["subject"] in positives
    detected = next((f for f in row["detected"] if positive and matches(f, expected, row)), None)
    active = next((f for f in row["active"] if positive and matches(f, expected, row)), None)
    exact = active and active["line"] in ({226, 227, 228} if row["subject"] == "S2" else {expected["line"]})
    probabilities = [(float(f.get("confidence", 0.5)), int(f is active)) for f in row["active"]]
    return {
        "severity": int(bool(active and active.get("severity") == expected["severity"])),
        "category": int(bool(active and active.get("category") == expected["category"])),
        "squaredError": sum((probability - actual) ** 2 for probability, actual in probabilities),
        "unsupported": len(row["active"]) - int(bool(active)),
        "historical": sorted({c["id"] for c in cases[row["subject"]]
                              if not positive and any(matches(f, c, row) for f in row["active"])}),
        "detected": int(bool(detected)), "retained": int(bool(active)), "exact": int(bool(exact)),
        "missedDetection": int(positive and not detected),
        "missedFinal": int(positive and not active),
        "inconclusive": sum(d["verdict"] == "inconclusive" for d in row["decisions"]),
    }


def distribution(values):
    if not values:
        return None
    values = sorted(values)
    return {"p50": median(values), "p95": values[math.ceil(0.95 * len(values)) - 1], "max": values[-1]}


def report(rows):
    groups = {}
    for phase in manifest["phases"]:
        for model in manifest["models"]:
            for variant in manifest["variants"]:
                members = [r for r in rows if (r["phase"], r["model"], r["variant"]) == (phase, model, variant)]
                counts = Counter()
                for r in members:
                    counts.update({k: v for k, v in scored(r).items() if k != "historical"})
                overhead = [[c for c in r["calls"] if c["role"] == "pilot-v2-verifier"] for r in members]
                active_count = counts["unsupported"] + counts["retained"]
                recall = counts["retained"] / max(counts["retained"] + counts["missedFinal"], 1)
                precision = counts["retained"] / max(active_count, 1)
                quality = {
                    "precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
                    "exactLocation": counts["exact"] / max(counts["retained"], 1),
                    "severity": counts["severity"] / max(counts["retained"], 1),
                    "category": counts["category"] / max(counts["retained"], 1),
                    "brier": counts["squaredError"] / active_count if active_count else None,
                }
                groups["/".join([phase, model, variant])] = {
                    "quality": quality,
                    "status": dict(Counter(r["status"] for r in members)), "totals": dict(counts),
                    "wallMs": distribution([r["wallMs"] for r in members]),
                    "verificationWallMs": distribution([r["verificationMs"] for r in members if r["verificationMs"] is not None]),
                    "inputTokens": distribution([sum(c["usage"]["input_tokens"] for c in cs) for cs in overhead if cs and all(c["usage"] for c in cs)]),
                    "outputTokens": distribution([sum(c["usage"]["output_tokens"] for c in cs) for cs in overhead if cs and all(c["usage"] for c in cs)]),
                    "calls": sum(len(r["calls"]) for r in members),
                    "totalObservedInputTokens": sum(c["usage"]["input_tokens"] for r in members for c in r["calls"] if c["usage"]),
                    "totalObservedOutputTokens": sum(c["usage"]["output_tokens"] for r in members for c in r["calls"] if c["usage"]),
                    "missingUsage": sum(not c["usage"] for r in members for c in r["calls"]),
                }
    gates = {}
    for phase in manifest["phases"]:
        for model in manifest["models"]:
            comparison = {}
            for variant in manifest["variants"]:
                comparison[variant] = [r for r in rows if (r["phase"],r["model"],r["variant"]) == (phase,model,variant)]
            baseline = comparison["current"]
            history = [p for r in baseline for p in scored(r)["historical"]]
            sufficient = len(history) >= 3 and len(set(history)) >= 2
            proposed = comparison["application-evidence"]
            complete = all(len(g) == 18 and all(r["status"] == "completed" for r in g) for g in comparison.values())
            differences = {}
            for variant in ("current", "original-context"):
                differences[variant] = [
                    sum(scored(r)["unsupported"] for r in comparison[variant] if r["repetition"] == n)
                    - sum(scored(r)["unsupported"] for r in proposed if r["repetition"] == n)
                    for n in manifest["repetitions"]]
            gates[f"{phase}/{model}"] = {
                "baselineHistoricalOccurrences": len(history), "baselineHistoricalPremises": len(set(history)),
                "baselineSufficient": sufficient, "complete": complete,
                "differences": differences, "allPositivesExactlyAnchored": sum(scored(r)["exact"] for r in proposed) == 9,
                "pairedReduction": complete and sufficient and sum(n > 0 for n in differences["current"]) >= 2
                and min(differences["current"]) >= 0,
            }
    return {"trials": len(rows), "groups": groups, "pairedGates": gates}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path)
    parser.add_argument("--public", type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.ledger.read_text().splitlines() if line]
    assert len({row["trial"] for row in rows}) == len(rows)
    if args.public:
        with args.public.open("w") as output:
            for row in rows:
                result = scored(row)
                for field in ("detected", "active"):
                    row[field] = [{k: v for k,v in finding.items() if k not in ("title","description")} for finding in row[field]]
                output.write(json.dumps({**row, "score": result}, ensure_ascii=False) + "\n")
        rows = [json.loads(line) for line in args.ledger.read_text().splitlines() if line]
    print(json.dumps(report(rows), indent=2))


if __name__ == "__main__":
    main()
