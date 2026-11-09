# Model-free source chain and pagination oracle

The successor dry-run recovered the form input, submit handler, bound
parser and typed precision decoder for all ten recorded #913 requests
on H1 and H2. The simulated verifier saw the same candidate and anchor
and received the initial receipts plus the three new source receipts.
There were zero real model calls and zero attempts on the GitHub write
ports. The replay keeps each original trial ID, request and target order.
[Per-request journal](replay.jsonl)

| Maximum observed | Value | Ceiling |
| --- | ---: | ---: |
| Opened Git blobs | 39 | 80 |
| Source bytes | 324,130 | 524,288 |
| Source wall time | 1,111 ms | 4,000 ms |
| Retrieved receipt bytes | 6,324 | 9,000 |
| Second packet bytes | 12,658 | 15,500 |
| Second prompt bytes | 17,828 | 21,500 |

The application starts at the selected TypeScript anchor and resolves
property and function symbols against regular blobs from the pinned Git
tree. It derives its source root from relative imports and constrains
that root to the application-authorized scope. It follows the input
assignment and submit callback, resolves the relative parser import
and identifies the unique exported decoder for the collection type.
No issue number, filename, expected verdict or oracle range is part of
the retriever. Ambiguous decoder attribution leaves the common Git lookup
available with an explicit reason. The implementation keeps source and
packet budgets, exact blob ranges, candidate and operation binding,
and the existing one-round evidence contract.
[Retriever](retrieve.cjs) · [Source analysis](typescript-chain.cjs)

The recovered source covers the same material path on both revisions.

| Link | Pinned source | Observation |
| --- | --- | --- |
| Form and completion | `frontend/src/presentation/domus-tasks.ts` | The input callback stores the value by material key. Submit normalizes it with the material precision. Failure marks the field and returns. Success emits the completion intent. |
| Parser and types | `frontend/src/domain/tasks.ts` | The relative import binds the normalizer to `taskQuantity`. H1 permits a final nonzero digit after up to five preceding fractional digits. H2 reduces that allowance by one. |
| Precision decoder | `frontend/src/adapters/task-values.ts` | The decoder accepts precision six and carries the value into the returned material entry. |

The evaluator ran the pinned JSON decoder, detail decoder and actual
component callbacks with a synthetic task response and a minimal Lit
shim. Both revisions admitted precision six and rejected a precision
setting of seven. Both submitted a five-place value and rejected a
seven-place value. H1 submitted `1.123456` for both the English point
and Spanish comma inputs. H2 marked the field invalid and emitted no
completion intent for either six-place input. The control exercises
the client path with seeded wire data. Live server and browser
integration are outside this probe.
[Consumer observations](consumer-observations.jsonl)

## #880 oracle

The pinned button callbacks emitted the same `more` intent on both
trees. The pinned composition routes it to `TaskController.more()`.
The controller probe observed page one, page two, then page one after
refresh, with cursors `null`, `next`, `null`. It observed three identity
reads and three access reads in each case. The P2 diff changes only the
message catalog. The pinned component test still expects the English
navigation label `Next page` on both revisions.

| Revision | Rendered English / Spanish label | Replacement observed | Accumulation finding |
| --- | --- | --- | --- |
| P1 | Next page / Página siguiente | Confirmed | Refuted. The rendered copy describes page navigation. |
| P2 | Load more / Cargar más | Confirmed | Inconclusive. The label suggests accumulation and conflicts with the pinned label expectation. Independent evidence that the list must retain earlier items is missing. |

P2 is a copy discrepancy control. A positive control for a behavioral
accumulation defect needs an independent retention requirement, such as
a pinned product contract or a test that asserts earlier rows stay
visible. The later documentation explicitly describes bounded
replacement, and remains retrospective context for these two trees.
The frozen pilot scores keep their historical oracle.
[Consumer observations](consumer-observations.jsonl) ·
[Later Domus navigation contract](https://github.com/vypdev/domus/blob/3c7d0c8b57cc6a53c611646e12a33b752d481730/docs/tasks/execution.md#L225)

## Reproduce

Provision the frozen H1/H2 and P1/P2 checkouts with the
[existing fixture instructions](../partial-diagnostic/preregistration.md#reproduce).
Run from the repository root with Node.js 24 and repository dependencies.

```sh
d=quality/bugbot/evidence/issue-950/chain-diagnostic
BUGBOT_CHAIN_SUBJECTS="$KNOWN_SUBJECTS" node --test "$d/retrieve.test.cjs"
node "$d/replay.cjs" "$KNOWN_SUBJECTS"
node "$d/consumer-controls.cjs" "$KNOWN_SUBJECTS" "$RESERVED_SUBJECTS"
```

The negative controls reject an out-of-scope request, a mismatched
revision, altered blob content, exhausted budgets, an unrelated
citation, a repeated evidence request and a publication attempt. The
two-producer fixture preserves common lookup without attributing either
producer. The probe and replay qualify neither a model nor production
activation.
