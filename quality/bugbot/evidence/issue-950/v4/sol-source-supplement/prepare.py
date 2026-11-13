"""Append missing static causal edges to six already locked v4 subjects."""
import argparse
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parent.parent
receipt = runpy.run_path(str(ROOT/"prepare.py"))["receipt"]
PATHS = {
    "X": [("backend/src/domus/infrastructure/sqlite.py",351,386)],
    "P": [("frontend/src/presentation/domus-administration.ts",286,339),
          ("frontend/src/presentation/administration-messages.ts",8,11)],
    "J": [("tests/browser/image_channel.py",17,45),("tests/python/test_image_channel.py",22,23)],
}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subjects",type=Path)
    a=parser.parse_args()
    packets=json.loads((ROOT/"evidence.json").read_text())
    bindings=json.loads((ROOT/"subjects.lock.json").read_text())
    output={}
    for subject in ("X1","X2","P1","P2","J1","J2"):
        items=[]
        for index,(path,start,end) in enumerate(PATHS[subject[0]],len(packets[subject])+1):
            items.append({**receipt(a.subjects/subject,bindings[subject]["head"],path,start,end),"id":f"evidence-{index}"})
        output[subject]=items
    print(json.dumps(output,indent=2,ensure_ascii=False))


if __name__=="__main__":
    main()
