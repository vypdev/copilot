# #892 Sol on-demand viewport evidence

[Preregistration](preregistration.md) · [Frozen commit](https://github.com/vypdev/copilot/commit/6e2258245fb5f882e876ade999e7b1a4911b9d53) ·
[Deterministic controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Receipt audit](receipt-audit.json) · [Causal audit](causal-review.json) · [Scores](scores.json)

All three arms started from the same seeded candidate, anchor, scoped
diff and S2–S4 on each pinned tree. The viewport selector and listener
were absent from the entire initial prompt. Only the on-demand arm
could receive new code. It used the verifier's typed request without
adding prepared ranges. The audit independently checked
6 distinct receipts against their pinned
Git blobs and exact ranges. Chromium observations and expected verdicts
remained evaluator inputs.

The ledger contains 18 scheduled slots and 30 provider attempts,
with no retries or GitHub write attempts.

## Comparison

| Arm | Tree and expected verdict | Requested | Retrieved link | Delivered link | Cited link | Supported correct | Valid inconclusive | Unsupported conclusive | Proven budget | Median wall ms | Gross input / output |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fixed | N1 · refuted | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 5952 | 28,564 / 239 (3/3 measured) |
| fixed | N2 · confirmed | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 5514 | 28,411 / 284 (3/3 measured) |
| repeat | N1 · refuted | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 12302 | 56,522 / 729 (3/3 measured) |
| repeat | N2 · confirmed | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 16593 | 56,218 / 908 (3/3 measured) |
| on-demand | N1 · refuted | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 11779 | 56,522 / 735 (3/3 measured) |
| on-demand | N2 · confirmed | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 17245 | 56,218 / 978 (3/3 measured) |

The link requires both the viewport selection and listener installation.
The reported token totals sum known case usage across both calls.
An accepted inconclusive can cite a useful fragment while naming a
remaining material gap. A conclusive label with a missing link does
not count as a supported verdict.

## Per attempt

| Slot | Typed request | Retrieval status and ranges | Link retrieved / delivered / cited | Verdict | Score | Anchor | Budget | Wall ms | Gross input / output |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: |
| N1-1-fixed | head readBlob navigation-overflow.ts 1–88 | unresolved · fixed-single-call | no / no / no | — | `unresolved-request` | RIGHT 107 | within | 5952 | 9520 / 81 |
| N1-1-repeat | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | inconclusive | `valid-inconclusive` | RIGHT 107 | within | 17132 | 18842 / 265 |
| N1-1-on-demand | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | inconclusive | `valid-inconclusive` | RIGHT 107 | within | 11489 | 18842 / 236 |
| N1-2-repeat | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | inconclusive | `valid-inconclusive` | RIGHT 107 | within | 11577 | 18842 / 229 |
| N1-2-on-demand | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | inconclusive | `valid-inconclusive` | RIGHT 107 | within | 11779 | 18840 / 258 |
| N1-2-fixed | head readBlob navigation-overflow.ts 1–88 | unresolved · fixed-single-call | no / no / no | — | `unresolved-request` | RIGHT 107 | within | 6058 | 9522 / 79 |
| N1-3-on-demand | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | inconclusive | `valid-inconclusive` | RIGHT 107 | within | 14505 | 18840 / 241 |
| N1-3-fixed | head readBlob navigation-overflow.ts 1–88 | unresolved · fixed-single-call | no / no / no | — | `unresolved-request` | RIGHT 107 | within | 4170 | 9522 / 79 |
| N1-3-repeat | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | inconclusive | `valid-inconclusive` | RIGHT 107 | within | 12302 | 18838 / 235 |
| N2-1-fixed | head readBlob navigation-overflow.ts 1–88 | unresolved · fixed-single-call | no / no / no | — | `unresolved-request` | RIGHT 107 | within | 5514 | 9469 / 86 |
| N2-1-repeat | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | confirmed | `unsupported-conclusive` | RIGHT 107 | within | 16593 | 18738 / 319 |
| N2-1-on-demand | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | confirmed | `unsupported-conclusive` | RIGHT 107 | within | 21285 | 18740 / 346 |
| N2-2-repeat | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | confirmed | `unsupported-conclusive` | RIGHT 107 | within | 18851 | 18738 / 333 |
| N2-2-on-demand | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | confirmed | `unsupported-conclusive` | RIGHT 107 | within | 16436 | 18736 / 293 |
| N2-2-fixed | head readBlob navigation-overflow.ts 1–88 | unresolved · fixed-single-call | no / no / no | — | `unresolved-request` | RIGHT 107 | within | 6938 | 9471 / 109 |
| N2-3-on-demand | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | confirmed | `unsupported-conclusive` | RIGHT 107 | within | 17245 | 18742 / 339 |
| N2-3-fixed | head readBlob navigation-overflow.ts 1–88 | unresolved · fixed-single-call | no / no / no | — | `unresolved-request` | RIGHT 107 | within | 5412 | 9471 / 89 |
| N2-3-repeat | head readBlob navigation-overflow.ts 1–88 | budget · line-budget | no / no / no | confirmed | `unsupported-conclusive` | RIGHT 107 | within | 15004 | 18742 / 256 |

The ledger preserves target details, adapter outcomes, exact receipts
sent and cited, and usage for each call. The score file includes the
separate selection and listener flags for each stage and the verifier's
bounded reason or named missing premise.


## Decision and failure location

Sol did not pass this diagnostic. All 18 first responses requested
the correct controller file with `readBlob` over lines 1–88.
That interval contains the decisive source, as the evaluator can
verify independently. The published limit is 80 lines. The fixed
arm recorded its six requests as unresolved. Both follow-up arms
returned the same `line-budget` status for all 12 requests. The
on-demand arm never opened a Git file. There was consequently no
new fragment to deliver or cite in any measured slot. The replay
measured request formation and admission. Git retrieval and delivery
were exercised by the deterministic controls.

In both follow-up arms, N1 produced three valid inconclusives. The
answers identify the missing connection between a fresh Overview
mousedown and `#down` before the click. N2 produced three valid
response envelopes with the expected `confirmed` label in each arm.
The explanations describe the expected behavior **if** the new
mousedown reaches `#down`. The available citations do not establish
that premise, and all six are unsupported conclusive replies. The
causal audit marks whether the explanation matches the source and
the score separately requires proof of the route. The on-demand
arm scored 0/3 supported refutations and 0/3 supported confirmations.
All 30 calls were measured, all 18 cases proved the budget and
there were zero write attempts.

The preregistered prompt described a bounded read but did not state
the numeric 80-line limit. That is a limitation of this trial when
attributing the oversized requests. The receipt controls show that
a compliant request for the decisive source reaches the final call.
The measured requests and admission rules were preserved verbatim.
The result leaves autonomous retrieval unqualified and does not
establish performance on a reserved case with a different chain.

PR #951 remains a draft and production activation stays disabled.
