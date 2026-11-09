"""Score #859 and merge its counts with the v2 cohort without replacing slots."""
import argparse
from collections import Counter
import json
from pathlib import Path
import runpy

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("base_ledger", type=Path)
parser.add_argument("expansion_ledger", type=Path)
parser.add_argument("--engine", type=Path, required=True)
parser.add_argument("--public", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
module = runpy.run_path(str(args.engine / "score-pilot.py"))
scored = module["scored"]
scored.__globals__["patterns"]["M"] = r"migration|broken link|missing target|not exist"
scored.__globals__["positives"].add("M2")
scored.__globals__["patterns"]["X"] = r"foreign.key|parent key|unique index"
scored.__globals__["positives"].add("X2")
scored.__globals__["cases"].update(json.loads((root.parent / "expansion-859/candidates.json").read_text()))
scored.__globals__["cases"].update(json.loads((root / "candidates.json").read_text()))

def load(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line]

base = load(args.base_ledger)
expansion = load(args.expansion_ledger)
if args.public:
    with args.public.open("w") as output:
        for row in expansion:
            result = scored(row)
            public = {**row, "score": result}
            for key in ("detected", "active"):
                public[key] = [{k: v for k,v in item.items() if k not in ("title","description")} for item in row[key]]
            output.write(json.dumps(public) + "\n")
combined = base + expansion
assert len({row["trial"] for row in combined}) == len(combined)
out = {}
for phase in ("frozen-replay","full-review"):
    for model in ("gpt-6-luna","gpt-6.1-sol"):
        group = [row for row in combined if (row["phase"],row["model"]) == (phase,model)]
        occurrences = [case for row in group if row["variant"] == "current" for case in scored(row)["historical"]]
        added = [row for row in expansion if (row["phase"],row["model"]) == (phase,model)]
        out[phase+"/"+model] = {
            "baselineOccurrences": len(occurrences), "baselinePremises": len(set(occurrences)),
            "baselineSufficient": len(occurrences) >= 3 and len(set(occurrences)) >= 2,
            "added": {variant: {
                "statuses": dict(Counter(row["status"] for row in added if row["variant"] == variant)),
                "unsupported": sum(scored(row)["unsupported"] for row in added if row["variant"] == variant),
                "positiveRetained": sum(scored(row)["retained"] for row in added if row["variant"] == variant),
            } for variant in ("current","original-context","application-evidence")},
        }
print(json.dumps({"original":len(base),"expansion":len(expansion),"combined":out},indent=2))
