"""Apply the unchanged primary oracle and quantify where candidates were lost."""
import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("score_v2", ROOT.parent / "score-pilot.py")
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)


def read(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def score(rows):
    # Reuse the frozen witness, matching windows, anchor fallback and quality gates.
    comparable = [{**row, "calls": [{**call, "role": "pilot-v2-verifier"}
                   if call["role"] == "pilot-v3-verifier" else call for call in row["calls"]]} for row in rows]
    summary = prior.report(comparable)
    for name, totals in summary["groups"].items():
        phase, model, variant = name.split("/")
        group = [r for r in rows if (r["phase"], r["model"], r["variant"]) == (phase, model, variant)]
        by_cause = Counter()
        per_subject = {}
        for row in group:
            value = prior.scored(row)
            if row["subject"] not in prior.positives:
                continue
            if value["retained"]:
                cause = "retained-exact" if value["exact"] else "retained-other-anchor"
            elif row["status"] != "completed":
                cause = "integrity-" + row["status"]
            elif not value["detected"]:
                cause = "not-detected"
            else:
                case = prior.cases[row["subject"]][0]
                matched = {f["id"] for f in row["detected"] if prior.matches(f, case, row)}
                decisions = [d["verdict"] for d in row["decisions"] if d["id"] in matched]
                cause = "verifier-" + decisions[0] if decisions else "not-admitted-or-associated"
            by_cause[cause] += 1
            per_subject.setdefault(row["subject"], Counter())[cause] += 1
        closed = [[c for c in r["calls"] if c["role"] == "pilot-v3-verifier"] for r in group]
        totals.update(positiveOutcomes=dict(by_cause), positiveOutcomesBySubject=per_subject,
                      reasons=dict(Counter(r["reason"] for r in group if "reason" in r)),
                      verifierPromptBytes=prior.distribution([c["promptBytes"] for cs in closed for c in cs]),
                      verifierCalls=sum(map(len, closed)), budgetSkipped=sum(r["budgetSkipped"] for r in group),
                      verifierInputAllSubjects=prior.distribution([sum(c["usage"]["input_tokens"] for c in cs)
                                                                 for cs in closed if all(c["usage"] for c in cs)]))
        if variant == "application-evidence":
            wall = totals["verificationWallMs"] or {"p95": 0}
            input_tokens = totals["inputTokens"] or {"p95": 0}
            output_tokens = totals["outputTokens"] or {"p95": 0}
            totals["observedOverheadWithinLimits"] = (wall["p95"] <= 90_000 and input_tokens["p95"] <= 32_768
                                                       and output_tokens["p95"] <= 4096)
            totals["overheadQualified"] = (totals["observedOverheadWithinLimits"] and totals["verifierCalls"] > 0
                                           and len(group) == 18 and all(r["status"] == "completed" for r in group)
                                           and not totals["budgetSkipped"] and not totals["missingUsage"])
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path)
    parser.add_argument("--public", type=Path)
    parser.add_argument("--partial", action="store_true")
    args = parser.parse_args()
    rows = read(args.ledger)
    fields = ("trial", "phase", "repetition", "model", "variant", "subject")
    key = lambda r: tuple(r[f] for f in fields)
    expected = {key(r) for r in read(ROOT.parent / "trial-ledger.jsonl")}
    observed = {key(r) for r in rows}
    assert len(observed) == len(rows) and len({r["trial"] for r in rows}) == len(rows)
    assert observed <= expected and (args.partial or observed == expected)
    summary = score(rows)
    if args.public:
        with args.public.open("w") as output:
            for row in sorted(rows, key=key):
                predictions = {field: [{k: v for k, v in item.items() if k not in {"title", "description"}}
                                       for item in row[field]] for field in ("detected", "active")}
                decisions = [{k: v for k, v in decision.items() if k != "reason"} for decision in row["decisions"]]
                output.write(json.dumps({**row, **predictions, "decisions": decisions, "score": prior.scored(row)}) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
