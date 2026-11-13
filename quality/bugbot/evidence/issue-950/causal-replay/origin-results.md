# Effective entry origins in the causal retriever

The resolver at `2d1d92c22` returned `provided` and selected
`BetaRepo.active_key` when one call to `wire(store: BetaDatabase)`
passed `BetaDatabase()` and the other passed `get_alpha()`.
The pinned factory returns `AlphaDatabase()`. The earlier implementation
kept the direct constructor and silently discarded the factory argument.
[Executable regression](reproduce-origins.cjs) · [Recorded baseline](origin-before.json)

The corrected prototype checks every reachable entry origin identified in
its bounded source analysis. It follows the value at the argument
evaluation point, supported factory returns and fields initialized by a
plain dataclass constructor. An annotation supplies no instance proof.
An unproved origin yields `unresolved` even beside a known constructor.
Two proved competing origins yield `ambiguous`. Both statuses omit any
effective implementation claim. A unique proved origin resolves even when
it differs from the annotation. Assignments after the call and statically
unreachable calls cannot supply the argument.
[Resolver cases](retrieve.test.cjs)

## Exact replay and SQLite control

The 12 original requests were replayed in their recorded order with their
original bindings and limits. All 12 retained a sufficient chain to
`SQLiteRecurrences.current_schedule_id` with anchor line 82. Each run checked
four entry origins. The native and standalone composition paths both have
an explicit constructor route and an owned-storage factory route. They
converge on the same SQLite adapter. The packet contains one complete
representative chain within the five-receipt cap. The evaluator attested
all delivered blobs, ranges and receipt bindings against the pinned trees.
The journal includes one row per request and retains any failure.
[Replay evaluator](replay.cjs) · [12 replay records](origin-replay.jsonl)

| Resource | Highest observed | Limit |
| --- | ---: | ---: |
| Opened files | 37 | 80 |
| Discovery and source read bytes | 295,080 | 524,288 |
| Retrieved evidence bytes | 8,445 | 9,000 |
| Retrieval wall time | 2,255 ms | 4,000 ms |

The separate control used the pinned application and reopened persisted
SQLite storage. The original T1 returned zero actions for both date-only
and timed schedules. T2 returned seven actions for each after removal of
the retired-state filter. The control stayed outside the verifier input.
[SQLite observations](origin-sqlite.jsonl)

## Simulated runner delivery

The successor runner sent two packets in each recorded exchange.
T1 and T2 received their unchanged initial packet plus five causal
receipts. The tests checked the bindings to the operation, candidate,
revision and Git tree, and preserved the anchor. The unresolved and
ambiguous cases received their original packet and the attribution status,
with no new effective implementation receipt. The common Git adapter also
returned the TypeScript workspace fragment for R1 with a source receipt.
The runner rejected a second request, a foreign citation and an oversized
combined packet. The complete packet ceiling is 15,500 bytes and the
prompt ceiling is 21,500 bytes. Write attempts and real model calls
were both zero.
[Runner tests](runner.test.cjs) · [Captured exchanges](origin-runner.jsonl)

| Case | Attribution or retrieval | New receipts | Second packet bytes | Second prompt bytes | Scripted verdict |
| --- | --- | ---: | ---: | ---: | --- |
| T1 | `provided` | 5 | 13,784 | 17,558 | `refuted` |
| T2 | `provided` | 5 | 13,924 | 17,698 | `confirmed` |
| ambiguous | `ambiguous` | 0 | 1,411 | 4,642 | `inconclusive` |
| unresolved | `unresolved` | 0 | 1,334 | 4,565 | `inconclusive` |
| R1 | `provided` | 1 | 8,759 | 12,518 | `refuted` |

## Reproduce

Prepare the pinned fixtures and Node/Python dependencies using the
[tree-search lab](../tree-search/reproduce.md). Set
`BUGBOT_CAUSAL_REFERENCE` to a clean checkout of
`2d1d92c22bc423d7208357da9097cc07b937745a` with dependencies installed and
`BUGBOT_CAUSAL_RUNNER_REPORT` to a fresh path for the simulated exchanges.

```sh
pilot=quality/bugbot/evidence/issue-950
export BUGBOT_CAUSAL_SUBJECTS="$TREE_SUBJECTS"
export BUGBOT_PILOT_V4_SUBJECTS="$BUGBOT_TREE_V4_SUBJECTS"

node --test "$pilot/causal-replay/reproduce-origins.cjs"
(cd "$pilot/tree-search" && shasum -a 256 -c frozen.sha256)
node "$pilot/tree-search/run.cjs" "$BUGBOT_TREE_PRIOR_SUBJECTS" "$TREE_SUBJECTS"
node --test "$pilot/causal-replay/"*.test.cjs "$pilot/on-demand/"*.test.cjs \
  "$pilot/tree-search/"*.test.cjs "$pilot/v4/"*.test.cjs
node "$pilot/causal-replay/replay.cjs" "$TREE_SUBJECTS" > origin-replay.jsonl

for subject in T1 T2; do
  checkout="$TREE_SUBJECTS/$subject"
  PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$checkout/backend/src:$checkout/tests/backend:$TREE_PY_DEPS" \
    python3 "$pilot/tree-search/local-probe.py" "$subject"
done
```

The pinned reference regression, 63 focused tests and the frozen preflight
passed. Graphify rebuilt the graph and reported partial extraction in
some repository files. The deterministic results cover the supported
Python source shapes and the common Git retrieval path. Model evaluation
of this correction, the next reserved non-Python pair and full-review
qualification are pending. Production activation remains disabled.
[Owning SDD](../../../../../specs/bugbot-analysis-publication-and-autofix.md#950-on-demand-evidence-anchors-and-qualification) ·
[27-issue traceability](../traceability.md)
