"""Render the scored path-pattern regression and its historical comparison."""
from collections import Counter
import json
from pathlib import Path
from statistics import median
import sys

HERE = Path(__file__).resolve().parent


def read(name):
    return json.loads((HERE / name).read_text())


def cell(value):
    return str(value).replace("|", "&#124;").replace("<", "&lt;").replace("\n", " ")


def phases(rows):
    return " / ".join(str(sum(row.get("stages", {}).get(stage, False) for row in rows))
                      for stage in ("retrieval", "delivery", "citation"))


def admitted(rows):
    return sum((r.get("admission") or {}).get("status") == "admitted" for r in rows)


def report(scored):
    baseline = read("../coverage-895-pilot/scores.json")
    plan = read("manifest.json")
    rows = scored["trials"]
    assert len(rows) == 36 and scored["writeAttempts"] == 0
    print(f"""# #895 path-pattern regression results

[Preregistration](preregistration.md) ·
[Frozen commit](https://github.com/vypdev/copilot/commit/{scored['freeze']}) ·
[Simulated controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Causal review](causal-review.json) · [Scores](scores.json)

The 36 slots recorded {scored['attempts']} provider attempts and zero
GitHub write attempts. The first packet on each tree was identical to
the previous pilot. The prompt and schema exposed the versioned Git
adapter's pattern modes and limits. The runner forwarded the model's
own request without adding sources or filters.

## Historical comparison and decision

All entries below compare on-demand trials. R/D/C means the decisive
configuration was recovered, delivered and cited, respectively.
Correct counts require the unchanged evidence, causal, anchor and
budget rubric. The old pilot admitted zero requests across both profiles.

| Model | Admitted old → new / 6 | R/D/C old → new | Original old → new / 3 | Mutant old → new / 3 | New fixed / repeat correct | New gate |
| --- | ---: | --- | ---: | ---: | --- | --- |""")
    for model, profile in scored["profiles"].items():
        old = [r for r in baseline["trials"] if r["model"] == model and r["arm"] == "on-demand"]
        new = [r for r in rows if r["model"] == model and r["arm"] == "on-demand"]
        by = profile["onDemandBySubject"]
        original = sum(r["correct"] for r in old if r["subject"] == "original")
        mutant = sum(r["correct"] for r in old if r["subject"] == "mutant")
        controls = profile["correct"]
        print(f"| {model} | {admitted(old)} → {admitted(new)} | {phases(old)} → {phases(new)} | "
              f"{original} → {by['original']} | {mutant} → {by['mutant']} | {controls['fixed']} / {controls['repeat']} | "
              f"{'Pass' if profile['passes'] else 'Did not pass'} |")

    print("""
## Results by model, tree and arm

| Model | Tree | Arm | Admitted / 3 | R/D/C | Supported correct | Outcome counts | Proven budget / 3 | Median wall ms | Gross input / output |
| --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |""")
    for model in plan["models"]:
        for subject in plan["subjects"]:
            for arm in plan["arms"]:
                group = [r for r in rows if (r["model"], r["subject"], r["arm"]) == (model, subject, arm)]
                assert len(group) == 3
                outcomes = ", ".join(f"{key} {value}" for key, value in Counter(r["status"] for r in group).items())
                durations = [r["wallMs"] for r in group if "wallMs" in r]
                metered = [r["usage"] for r in group if r.get("usage")]
                tokens = " / ".join(f"{sum(u[key] for u in metered):,}" for key in ("input_tokens", "output_tokens"))
                print(f"| {model} | {subject} | {arm} | {admitted(group)} | {phases(group)} | {sum(r['correct'] for r in group)} | "
                      f"{outcomes} | {sum(r.get('budget') == 'within' for r in group)} | "
                      f"{round(median(durations)) if durations else '—'} | {tokens} ({len(metered)}/3 metered) |")

    print("""
## Per trial

| Trial | Chosen mode(s) | Admission | Retrieval result | R/D/C | Verdict | Outcome | First stopping stage | Budget |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |""")
    for row in rows:
        admission = row.get("admission") or {}
        lookup = row.get("lookup") or {}
        detail = [lookup.get("status"), lookup.get("reason")]
        detail.extend(x.get("reason") for x in lookup.get("results", []))
        detail.extend(f"{p['path']} {p['start']}–{p['end']}" for p in row.get("retrieved", []))
        failure = row.get("failure")
        status = row["status"] + (f" ({failure['stage']}/{failure['code']})" if failure else "")
        print(f"| {row['trial']} | {', '.join(row['modes']) or '—'} | "
              f"{admission.get('reason', admission.get('status', '—'))} | "
              f"{cell(' · '.join(dict.fromkeys(x for x in detail if x))) or '—'} | {phases([row])} | "
              f"{row.get('verdict') or '—'} | {cell(status)} | {row['stop'] or '—'} | {row.get('budget', 'unknown')} |")


if __name__ == "__main__":
    report(json.loads(Path(sys.argv[1]).read_text()))
