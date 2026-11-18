"""Score the frozen expanded cohort and publish bounded result facts."""
import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT/"manifest.json").read_text())
CASE = json.loads((ROOT/"candidates.json").read_text())
spec = importlib.util.spec_from_file_location("score_v2", ROOT.parent/"score-pilot.py")
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
prior.cases = CASE
prior.patterns.update(X=r"foreign.key|parent key|unique index", M=r"migration|rollback|link|href",
                      P=r"toBeEnabled|edit preferences|disabled|enabled", J=r"transport|frame|integer|identity")
prior.positives = {subject for subject in CASE if subject.endswith("2")}


def read(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def quality(t):
    precision = t["retained"] / max(t["retained"] + t["unsupported"],1)
    recall = t["retained"] / max(t["retained"] + t["missedFinal"],1)
    active = t["retained"] + t["unsupported"]
    return {"precision":precision,"recall":recall,"f1":2*precision*recall/(precision+recall) if precision+recall else 0,
            "exactLocation":t["exact"]/max(t["retained"],1),"severity":t["severity"]/max(t["retained"],1),
            "category":t["category"]/max(t["retained"],1),"brier":t["squaredError"]/active if active else None}


def group_result(rows):
    totals = Counter()
    outcomes = {}
    for row in rows:
        facts = row["score"]
        totals.update({k:v for k,v in facts.items() if k != "historical"})
        subject = row["subject"]
        status = row["status"]
        if subject in prior.positives and status == "completed":
            case = CASE[subject][0]
            matching = {f["id"] for f in row["detected"] if prior.matches(f,case,row)}
            verdict = next((d["verdict"] for d in row["decisions"] if d["id"] in matching),None)
            status = ("exact" if facts["exact"] else "retained-other-anchor" if facts["retained"] else
                      "not-detected" if not facts["detected"] else verdict or "dropped")
        outcomes.setdefault(subject,Counter())[status] += 1
    calls = [c for row in rows for c in row["calls"]]
    closed = [[c for c in r["calls"] if c["role"] == "pilot-v4-verifier"] for r in rows]
    closed_observed = [[c for c in cs if c["usage"]] for cs in closed]
    closed_complete = [cs for cs in closed if cs and all(c["usage"] for c in cs)]
    missing = sum(not c["usage"] for c in calls)
    distribution = prior.distribution
    def totals_for(key, sample):
        return distribution([sum(c["usage"][key] for c in cs) for cs in sample if cs])
    return {"status":dict(Counter(r["status"] for r in rows)), "totals":dict(totals), "quality":quality(totals),
            "caseOutcomes":outcomes,"failures":dict(Counter(r["reason"] for r in rows if "reason" in r)),
            "callOutcomes":dict(Counter(f'{c["role"]}/{c["outcome"]}' for c in calls)), "callsMissingUsage":missing,
            "closedCallsMissingUsage":sum(not c["usage"] for cs in closed for c in cs),
            "sharedDetectorAttributions":sum("sharedId" in c for c in calls),
            "wallMs":distribution([r["wallMs"] for r in rows]),
            "addedWallMs":distribution([r["verificationMs"] for r in rows if r["verificationMs"] is not None]),
            "inputTokens":totals_for("input_tokens",closed_complete), "outputTokens":totals_for("output_tokens",closed_complete),
            "observedInputIncludingUnmeteredSubjects":totals_for("input_tokens",closed_observed),
            "grossTotalInput":sum(c["usage"]["input_tokens"] for c in calls if c["usage"]),
            "cachedTotalInput":sum(c["usage"].get("cached_input_tokens",0) for c in calls if c["usage"]),
            "totalOutput":sum(c["usage"]["output_tokens"] for c in calls if c["usage"]),
            "budgetSkipped":sum(r["budgetSkipped"] for r in rows),
            "recoveredVerificationTimeouts":sum(r["status"]=="completed" and any(c["outcome"]=="provider-turn-timeout" for c in cs)
                                                for r,cs in zip(rows,closed)),
            "reanchors":dict(Counter(d["anchor"]["kind"] for r in rows for d in r["decisions"] if "anchor" in d
                                     and d["anchor"]["before"]!=d["anchor"]["line"]))}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("ledger",type=Path)
    cli.add_argument("--public",type=Path)
    cli.add_argument("--partial",action="store_true")
    a = cli.parse_args()
    rows=read(a.ledger)
    fields=("trial","phase","model","subject","repetition","variant")
    key=lambda r:tuple(r[f] for f in fields)
    expected={key(r) for r in read(ROOT/"trial-ledger.jsonl")}
    observed={key(r) for r in rows}
    assert len(observed)==len(rows)==len({r["trial"] for r in rows})
    assert observed <= expected and (a.partial or observed==expected)
    for row in rows:
        row["score"]=prior.scored(row)
    groups={}
    paired={}
    for phase in MANIFEST["phases"]:
        for model in MANIFEST["models"]:
            cohort={arm:[r for r in rows if (r["phase"],r["model"],r["variant"])==(phase,model,arm)] for arm in MANIFEST["variants"]}
            local={arm:group_result(rs) for arm,rs in cohort.items()}
            groups.update({f"{phase}/{model}/{arm}":g for arm,g in local.items()})
            cases=Counter(c for r in cohort["current"] for c in r["score"]["historical"])
            app=local["application-evidence"]
            n=len(CASE)*len(MANIFEST["repetitions"])
            complete=all(len(rs)==n and all(r["status"]=="completed" for r in rs) for rs in cohort.values())
            sufficient=len(cases)>=2 and sum(cases.values())>=3
            deltas={arm:[sum(r["score"]["unsupported"] for r in cohort[arm] if r["repetition"]==i)-
                         sum(r["score"]["unsupported"] for r in cohort["application-evidence"] if r["repetition"]==i)
                         for i in MANIFEST["repetitions"]] for arm in ("current","original-context")}
            budget=all(app[k] and app[k]["p95"]<=cap for k,cap in (("inputTokens",32768),("outputTokens",4096),("addedWallMs",90000)))
            paired[f"{phase}/{model}"]={"historicalAlerts":dict(cases),"baselineSufficient":sufficient,"complete":complete,
                "positiveAnchorsQualified":app["totals"].get("exact",0)==n//2,
                "differences":deltas,"pairedReduction":{arm:complete and sufficient and min(values)>=0 and sum(x>0 for x in values)>=2 for arm,values in deltas.items()},
                "observedBudgetWithinLimits":budget,"overheadQualified":budget and app["callsMissingUsage"]==0
                and app["budgetSkipped"]==0 and app["status"]=={"completed":n}}
    if a.public:
        with a.public.open("w") as f:
            for r in sorted(rows,key=key):
                views={name:[{k:v for k,v in item.items() if k not in {"title","description"}} for item in r[name]] for name in ("active","detected")}
                decisions=[{k:v for k,v in d.items() if k!="reason"} for d in r["decisions"]]
                f.write(json.dumps({**r,**views,"decisions":decisions})+"\n")
    observed_calls = [c for r in rows for c in r["calls"] if not c.get("reused")]
    unique = {"calls":len(observed_calls),"missingUsage":sum(not c["usage"] for c in observed_calls),
              "inputTokens":sum(c["usage"]["input_tokens"] for c in observed_calls if c["usage"]),
              "outputTokens":sum(c["usage"]["output_tokens"] for c in observed_calls if c["usage"])}
    print(json.dumps({"trials":len(rows),"uniqueProviderCalls":unique,"groups":groups,"pairedGates":paired},indent=2))


if __name__=="__main__":
    main()
