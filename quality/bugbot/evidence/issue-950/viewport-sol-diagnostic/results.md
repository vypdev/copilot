# #892 Sol verdict control with viewport identity

[Preregistration](preregistration.md) · [Frozen commit](https://github.com/vypdev/copilot/commit/6337c107837cf2c52a520ee193460bb8f6740f06) ·
[Deterministic controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Causal audit](causal-review.json) · [Scores](scores.json)

This replay reused the historical seeded candidate, diff, tree, line-107
anchor, final-only schema and prompt. The sole prompt change on each
tree was replacing the S1 object with lines 21–32 and their new receipt.
The new evidence shows `update` selecting `.bar` as the viewport and
installing `#down` there. The evaluator withholds the Chromium
observations and verdict labels.

The model-free controls verified the exact prompt delta and the receipt
against both Git blobs, and rejected the old S1 receipt in the expanded
packet. The historical packet still covers the listener and handler.
It fails the new viewport identity check. Both expanded packets cover
all five required range groups.

## Comparison

| Tree and expected verdict | Previous Sol | Expanded S1 | Valid | All five range groups cited | Causal review passed | Proven budget | Median wall ms | Gross input / output |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N1 · refuted | 2/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 5562 | 29,021 / 279 (3/3 measured) |
| N2 · confirmed | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 9427 | 28,837 / 498 (3/3 measured) |

The previous scores use the previous coverage rule. The ledger records
6 one-call dry-run attempts, zero retries, zero detector or
recovery calls, and zero GitHub write attempts.

## Per attempt

| Trial | Verdict | Outcome | Cited range groups | Aliases | Anchor | Budget | Wall ms | Gross input | Output |
| --- | --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: |
| N1-Sol-1 | refuted | `correct` | 5/5 | S1, S2, S4, S3 | RIGHT 107 | within | 5645 | 9673 | 88 |
| N1-Sol-2 | refuted | `correct` | 5/5 | S1, S2, S3, S4 | RIGHT 107 | within | 5562 | 9673 | 94 |
| N1-Sol-3 | refuted | `correct` | 5/5 | S1, S2, S3, S4 | RIGHT 107 | within | 4997 | 9675 | 97 |
| N2-Sol-1 | confirmed | `correct` | 5/5 | S1, S2, S3, S4 | RIGHT 107 | within | 9427 | 9613 | 149 |
| N2-Sol-2 | confirmed | `correct` | 5/5 | S1, S2, S3, S4 | RIGHT 107 | within | 5989 | 9613 | 129 |
| N2-Sol-3 | confirmed | `correct` | 5/5 | S1, S2, S3, S4 | RIGHT 107 | within | 10225 | 9611 | 220 |

The per-attempt scores retain coverage for every range group and the
reviewed causal explanation. Chromium remains independent evaluator
evidence. All acceptance counts use the preregistered verdict, citation,
causal explanation, anchor and budget checks.


## Decision

Sol passed this prepared-packet control. All three N1 answers explain
that the new `mousedown` reaches the viewport and clears suppression
before the item click emits selection. All three N2 answers explain
that the new `mousedown` preserves suppression, the click consumes it
and `tabs.ts` returns before emitting selection. Every trial cited the
rendered item and its placement, viewport selection, listener wiring,
suppression transition and selection decision. All six attempts
preserved the anchor, proved the budget and produced valid responses.

The historical comparison is 2/3 to 3/3 on N1 and 3/3 to 3/3 on N2.
The N1 gap identified in the earlier inconclusive answer was covered
and cited here. These are small samples under two coverage rules.

## Separate retrieval test

Preregister a new replay on the same trees and seeded candidate. Use
the same initial packet for three arms, with S1 withheld in every arm.
Keep the scoped diff and S2–S4, and avoid naming the missing selector,
file range or expected outcome in the instructions. Begin with a fresh
verifier call that can issue a typed request. Use the standard common
Git adapter, the pinned reviewed tree, one application-controlled
evidence round and the SDD's shared case budgets. Use three repetitions
per tree and arm, with Sol at low effort and GitHub write ports blocked.

Use the fixed initial packet as a one-call control. In the second-call
control, admit requests under the same rules as the retrieval arm and
return the request status without adding source. In the retrieval arm,
let the application execute the verifier's request against the pinned
tree and return its exact receipts. Do not seed a search term, a file
range or a prepared fragment in the retrieval path. Validate every
receipt against the candidate, operation and tree.

Record separately whether the verifier asks for the missing evidence,
whether retrieval delivers the viewport selection and listener, and
whether the final verdict cites those lines together with the item and
`tabs.ts` behavior. For this known-case follow-up, require retrieval,
delivery and citation of the missing link, the correct causal verdict
at line 107, proven budget and zero writes in all six on-demand trials.
Compare the six with both controls. Keep the evaluator's Chromium
observations and expected ranges out of the model and adapter inputs.
Detector handoff and qualification on reserved cases are separate.

PR #951 stays in draft and production activation remains disabled.
