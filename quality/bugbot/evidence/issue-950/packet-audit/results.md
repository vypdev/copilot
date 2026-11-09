# Evidence packet audit for #950

This iteration used zero model calls. The earlier pilots, manifests,
retrievers, runners and measured journals remain frozen at their recorded
versions. The successor common Git adapter lives with this audit.
[Reference commit](https://github.com/vypdev/copilot/commit/d1025150830dd212e7a188a14b6301029a440f99) ·
[Previous measured diagnostic](../module-diagnostic/results.md)

## #913 common Git retrieval

On H1 at the pinned revision, `function taskQuantity` alone returns
`frontend/src/domain/tasks.ts:9–47`. The frozen adapter returns
`fragment-byte-budget` and zero receipts when the same request adds
`taskQuantity(`. It merges windows around the declaration and later call
before checking bytes. The successor bounds every match window in UTF-8
bytes and lines, and merges adjacent or overlapping windows only if the
union fits. An admitted auxiliary lookup that hits a budget retains earlier
receipts and reports its own result and reason. A failed tree check, invalid blob or
unexpected Git failure withholds the entire result. Git proofs preserve
exact source ranges and operation, candidate, head, tree and blob identity.
[Successor adapter](git-evidence.cjs) · [Regression and integrity tests](git-evidence.test.cjs)

The ten typed requests below are in the journal's original request order.
The source path for every retained fragment is `frontend/src/domain/tasks.ts`.
The decisive range is 28–30. “Evidence B” counts serialized receipts and
“Source B” counts blob bytes read under the shared lookup budget.
[Request, per-query outcomes and exact receipts](common-replay.jsonl)

| Order and trial | Tree | Before | After | Query results in request order | Retained ranges | Decisive before → after | Files | Source B | Matches | Evidence B | ms |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 `0ae4bbff6328d69c` | H1 | fragment-byte-budget | partial | provided, multiple-files, evidence-packet-budget | 9–47, 41–79 | no → yes | 40 | 324,674 | 12 | 6,220 | 1,952 |
| 2 `5d54bd11d0e9f8f1` | H1 | fragment-byte-budget | partial | provided, multiple-files, evidence-packet-budget | 9–47, 41–79 | no → yes | 40 | 324,674 | 12 | 6,220 | 2,055 |
| 3 `b5e12ffbd20bced1` | H2 | fragment-byte-budget | partial | provided, multiple-files, evidence-packet-budget | 9–47, 41–79 | no → yes | 40 | 324,674 | 13 | 6,220 | 1,984 |
| 4 `2ed5f8de842b60fa` | H2 | provided | provided | provided | 9–47 | yes → yes | 8 | 40,344 | 1 | 3,204 | 414 |
| 5 `bc77ee5bf3095465` | H2 | fragment-byte-budget | partial | provided, multiple-files, evidence-packet-budget | 9–47, 41–79 | no → yes | 40 | 324,674 | 13 | 6,220 | 1,947 |
| 6 `f3009dfcabd4a89b` | H1 | fragment-byte-budget | partial | provided, multiple-files, evidence-packet-budget | 9–47, 41–79 | no → yes | 40 | 324,674 | 13 | 6,220 | 1,952 |
| 7 `fcecccf260c46234` | H2 | fragment-byte-budget | partial | provided, multiple-files, evidence-packet-budget | 9–47, 41–79 | no → yes | 40 | 324,674 | 12 | 6,220 | 1,887 |
| 8 `68cf454cb0603a73` | H2 | fragment-byte-budget | provided | provided, provided | 9–47, 41–79 | no → yes | 8 | 40,344 | 3 | 6,220 | 436 |
| 9 `7710f2968abd7a76` | H2 | fragment-byte-budget | provided | provided, provided | 9–47, 41–79 | no → yes | 8 | 40,344 | 3 | 6,220 | 413 |
| 10 `b93520febc4b80ad` | H1 | fragment-byte-budget | provided | provided, provided | 9–47, 41–79 | no → yes | 8 | 40,344 | 3 | 6,220 | 420 |

All ten requests now return the decisive source, compared with one on the
frozen adapter. Six results are partial because auxiliary lookups are
ambiguous or reach the evidence packet bound. A simulated verifier uses
the retained receipt after a partial response.

## #918 T2 packet audit

The three original Sol second prompts were reconstructed byte for byte.
For each trial the first and second prompt hashes match the measured
journal. The reconstruction uses the original runner's request builder,
pinned blobs with receipt identities checked against the recorded lookup,
and the original elapsed-time metadata. The historical verdict was
inconclusive in each trial. Only reason hashes were recorded, so the
packet gaps below do not establish why Sol chose that verdict.
[Full historical and simulated prompt bodies](t2-packets.jsonl)

The historical packet showed the resolved SQLite wiring, the unfiltered
T2 `current_schedule_id` query, the application-side slot lookup and the
start of the fixed action branch. The missing links were the concrete
`fixed_slot_for_occurrence` read and slot validation, the persisted state
decoder and row/header check, or the last part of the branch that uses the
matching slot key and returns the actions.

The feasibility control reads exact pinned ranges through a bounded Git
reader. It extends the application receipt through the branch return,
adds the decoder and row model as initial evidence, and extends the
existing implementation receipt with the adapter imports, persisted state
headers, slot read and write call. It drops the interface-only initial
receipt and the duplicate diff receipt. The same pinned diff remains in
the request, and the Git anchor is unchanged. Routing links group ranges
by receipt so they no longer repeat file paths and receipt IDs per span.
The simulated verifier receives the same revised initial receipts on both
calls and exactly five retrieved receipts in the second call.

| Historical trial | Historical packet B | Revised packet B | Revised prompt B | Retrieved evidence B | Opened files | Blob + discovery B | Source ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `3c48ff17a66fc0be` | 13,745 | 15,121 | 18,895 | 8,649 | 41 | 337,231 | 2,380 |
| `8e24a9e122ac813e` | 13,953 | 15,329 | 19,103 | 8,707 | 41 | 337,231 | 2,419 |
| `ab89bb85ce35ac8d` | 13,934 | 15,310 | 19,084 | 8,707 | 41 | 337,307 | 2,410 |

Each control fits the 15,500-byte full packet, 21,500-byte prompt, 9,000-byte
retrieved evidence, 80-file, 512 KiB source and four-second bounds. The
audit charges the original retrieval and the supplemental reads together.
All 12 original #918 requests separately preserved the SQLite
chain, exact anchors and receipt validity. The complete simulated second
packets for those 12 requests reached at most 13,963 packet bytes
and 17,737 prompt bytes. The original runner tests and revised
packet simulator recorded zero write attempts.
[Original-request replay](causal-replay.jsonl) ·
[12 complete packet measurements](causal-packets.jsonl) · [Runner controls](runner-controls.jsonl)

The revised source packet supports the read path conditional on a valid
persisted retired fixed row, the active definition and an occurrence still
owning its slot. With a sole matching schedule row, T2's unfiltered query
can return its ID. The concrete adapter then reads the slot and decodes
the fixed row with its persisted state. The caller uses the matching slot
key and returns the action tuple. A public transition to that retired
state and row selection when multiple schedules match remain unproved.
The separate SQLite evaluator used
date-only and timed fixtures, returning zero actions on T1 and seven on
T2. Its output never enters either prompt.
[Evaluator-only SQLite results](sqlite-evaluator.jsonl)

## Evidence for the next diagnostic

The revised T2 packet demonstrates bounded source packing with
auditor-selected locators. Automatic discovery of the additional links and
a verifier verdict on the revised packet remain unmeasured. A new reserved
original/mutation pair outside Python must use common Git only and freeze
the same initial packet across arms before measurement. It must check that
a decisive receipt survives auxiliary ambiguity or budget exhaustion,
and record recovery, citation, exact anchoring and verdict separately.
Apply the independent Luna and Sol gates and compare against both controls.
Review this evidence before deciding whether to run that diagnostic.
Production activation remains disabled.

## Reproduce

Use the pinned SDK and fixtures from the earlier
[tree-search](../tree-search/reproduce.md) and
[TypeScript diagnostic](../module-diagnostic/preregistration.md)
instructions. All commands below are model-free.

```sh
pilot=quality/bugbot/evidence/issue-950
audit="$pilot/packet-audit"
export BUGBOT_CAUSAL_SUBJECTS="$TREE_SUBJECTS"
export BUGBOT_PACKET_RESERVED_SUBJECTS="$RESERVED_SUBJECTS"
export BUGBOT_PILOT_V4_SUBJECTS="$BUGBOT_TREE_V4_SUBJECTS"

node "$audit/replay-common.cjs" "$RESERVED_SUBJECTS"
node "$pilot/causal-replay/replay.cjs" "$TREE_SUBJECTS" > replay.jsonl
node "$audit/audit-packet.cjs" "$TREE_SUBJECTS" replay.jsonl
node "$audit/audit-packet.cjs" "$TREE_SUBJECTS"
node --test "$pilot/causal-replay/"*.test.cjs "$pilot/on-demand/"*.test.cjs \
  "$pilot/tree-search/"*.test.cjs "$pilot/v4/"*.test.cjs "$audit/"*.test.cjs
graphify update .
```

Set `BUGBOT_CAUSAL_RUNNER_REPORT` to capture the focused runner exchanges.
The SQLite evaluator uses the separate probe command in the tree-search
instructions.

The 71 focused tests passed. The on-demand, tree-search and
module-diagnostic checksums all verified. Graphify rebuilt the graph and
reported partial extraction in some repository files.
