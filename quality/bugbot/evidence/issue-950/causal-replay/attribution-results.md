# Call-site attribution and simulated causal runner

This iteration ran without a model provider. It covers the causal prototype
and the next pilot's dry-run entry point. Production activation remains
disabled. The previous pilot's preregistration, runner and measured journal
are preserved. [Frozen tree-search pilot](../tree-search/preregistration.md) ·
[Measured journal](../tree-search/trials.jsonl)

## Call-site regression

The pinned resolver at `232b8eb35` returned `provided` with
`BetaRepo.active_key` for this fixture. [Recorded baseline](attribution-before.json) ·
[Executable reproduction](reproduce-attribution.cjs)

```python
def create(store):
    inspection = Inspection(store)
    store = BetaDatabase()
    return inspection
```

The resolver now traces the writes that can reach the exact argument
evaluation. A later write leaves the parameter origin unproved
(`unresolved`). A preceding assignment that reaches the argument on all
supported paths can establish the concrete instance. Competing branches
produce `ambiguous`. Tests also cover a branch that returns before the
call, a shadowed binding, and the existing declarations and competing
implementations. Unsupported binding shapes remain conservative.
[Resolver fixtures](retrieve.test.cjs)

## Replay of the original #918 requests

All 12 original requests returned a sufficient chain, six each on the pinned
T1 and T2 trees. The replay attested the Git blobs and line ranges, the
receipts and their bindings, the transaction wiring to
`SQLiteRecurrences.current_schedule_id`, and the branch that consumes the
returned schedule ID. The selected anchor stayed at line 82. The replay
preserves each original request and its reference result.
[12 replay rows](attribution-replay.jsonl) · [Replay evaluator](replay.cjs) ·
[Previous baseline and chain](results.md)

| Retrieval measurement | Maximum observed | Published limit |
| --- | ---: | ---: |
| Files opened | 37 | 80 |
| Discovery and source bytes read | 286,951 | 524,288 |
| Evidence bytes | 8,445 | 9,000 |
| Retrieval wall time | 2,287 ms | 4,000 ms |

The SQLite control persisted and reopened the retired schedule before
checking the actions returned by the pinned application.
[SQLite control observations](attribution-sqlite.jsonl)

| Tree | Date only | With time |
| --- | ---: | ---: |
| T1 with the retired-state filter | 0 actions | 0 actions |
| T2 with the filter removed | 7 actions | 7 actions |

## What the simulated verifier received

The successor entry is `trial` in [runner.cjs](runner.cjs). It reuses the
frozen runner's scenario and request builder and the existing two-round
contract. It requires an explicit verifier transport. Its recovery round
uses the candidate's pinned comparison and anchor, and ordinary typed
queries outside the causal lookup keep the existing Git retrieval path.

The simulated transport requested evidence in the first call and received
the unchanged initial packet plus five causal receipts and the typed
response in the second. The test recomputed receipt bindings for the
candidate, operation, head and tree. It kept the anchor unchanged and
rejected another request, a foreign receipt and a combined packet over
budget. The complete packet and prompt ceilings were 15,500 and 21,500
bytes respectively. All five integration tests had zero write attempts.
[Runner integration tests](runner.test.cjs) ·
[Parsed packets delivered to the transport](runner-observations.jsonl)

| Tree | Calls to simulated transport | Initial packet bytes | Combined packet bytes | Second prompt bytes | New receipts | Scripted verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| T1 | 2 | 4,651 | 13,765 | 17,539 | 5 | `refuted` |
| T2 | 2 | 4,651 | 13,905 | 17,679 | 5 | `confirmed` |

The scripted verdicts test transport and contract integrity. The replay and
SQLite control independently establish evidence sufficiency and behavior.
This run provides no measured verdicts, latency or tokens from a model.

## Reproduce

Provision the pinned fixtures and dependencies using the earlier
[tree-search lab instructions](../tree-search/reproduce.md). Set
`TREE_SUBJECTS` to the T1/T2 fixture directory, `TREE_PY_DEPS` to the v4
Python dependency directory and `BUGBOT_CAUSAL_REFERENCE` to a clean,
dependency-ready checkout of `232b8eb3570728d5d2b8f0d7c7777e0ce96c32e5`.

```sh
pilot=quality/bugbot/evidence/issue-950
export BUGBOT_CAUSAL_SUBJECTS="$TREE_SUBJECTS"
export BUGBOT_PILOT_V4_SUBJECTS="$BUGBOT_TREE_V4_SUBJECTS"

node --test "$pilot/causal-replay/reproduce-attribution.cjs"
(cd "$pilot/tree-search" && shasum -a 256 -c frozen.sha256)
node "$pilot/tree-search/run.cjs" "$BUGBOT_TREE_PRIOR_SUBJECTS" "$TREE_SUBJECTS"
node --test "$pilot/causal-replay/"*.test.cjs "$pilot/on-demand/"*.test.cjs \
  "$pilot/tree-search/"*.test.cjs "$pilot/v4/"*.test.cjs
node "$pilot/causal-replay/replay.cjs" "$TREE_SUBJECTS" > attribution-replay.jsonl

for subject in T1 T2; do
  checkout="$TREE_SUBJECTS/$subject"
  PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$checkout/backend/src:$checkout/tests/backend:$TREE_PY_DEPS" \
    python3 "$pilot/tree-search/local-probe.py" "$subject"
done
```

Set `BUGBOT_CAUSAL_RUNNER_REPORT` to a fresh output path before running the
tests to capture the two simulated exchanges. The reference reproduction,
all 56 focused tests, the frozen manifest preflight and
`graphify update .` completed locally. The Graphify AST pass reported
partial extraction in some repository files and rebuilt the graph.
