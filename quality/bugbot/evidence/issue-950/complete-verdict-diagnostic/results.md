# #892 complete evidence verdict control

[Preregistration](preregistration.md) · [Frozen commit](https://github.com/vypdev/copilot/commit/2799f5303a2602f2065899f25f0637338f5eb0a4) ·
[Deterministic controls](runner-control.json) · [Attempt ledger](trials.jsonl) · [Scores](scores.json)

The runner used the same seeded candidate, fixed anchor and four Git
fragments per tree as the historical matched-source control. Each model
received the same prompt bytes, schema and receipt IDs on a given tree.
Chromium observations and the expected states remained in the evaluator.
The ledger records 12 one-call closed dry-run attempts, zero
retries, zero detector or recovery calls and zero GitHub write attempts.

## Contract audit

The prior Luna matched-source attempts recorded `citation-integrity`,
which grouped duplicate and foreign citations. The prior Sol attempts
recorded `invalid-verifier-response`, which grouped shape and candidate
identity. The exact checks remain indeterminate for all four attempts.
The new controls exercise these checks separately. Final responses
contain no read fields and the runner owns candidate, revision and
anchor binding. Receipt aliases resolve to the same historical IDs
after validation.

## Results by profile and tree

| Model | Tree and expected verdict | Valid | Correct | Contract rejections | Valid inconclusives | Judgment errors | Other | All links cited | Exact anchor | Proven budget | Median wall ms | Gross input / output |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-6 Luna | N1 · refuted | 3/3 | 0/3 | 0 | 0 | 0 | 3 | 0/3 | 3/3 | 3/3 | 3636 | 28,799 / 251 (3/3 measured) |
| GPT-6 Luna | N2 · confirmed | 3/3 | 0/3 | 0 | 0 | 0 | 3 | 0/3 | 3/3 | 3/3 | 3729 | 28,610 / 257 (3/3 measured) |
| GPT-6.1 Sol | N1 · refuted | 3/3 | 2/3 | 0 | 1 | 0 | 0 | 3/3 | 3/3 | 3/3 | 6635 | 28,873 / 522 (3/3 measured) |
| GPT-6.1 Sol | N2 · confirmed | 3/3 | 3/3 | 0 | 0 | 0 | 0 | 3/3 | 3/3 | 3/3 | 6374 | 28,608 / 407 (3/3 measured) |

Known token counts are summed by row. The denominator retains any
unmetered attempts. Correctness requires the expected verdict and all
three supported causal states, exact anchor, and a proven budget.

## Per attempt

| Model | Tree | Rep | Contract / score | Raw verdict | Delivered links | Cited links | Aliases | Anchor | Budget | Wall ms | Gross input | Output |
| --- | --- | ---: | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: | ---: |
| GPT-6 Luna | N1 | 1 | Unsupported conclusive | confirmed | 3/3 | 2/3 | S2, S3, S4 | exact | within | 3628 | 9599 | 82 |
| GPT-6.1 Sol | N1 | 1 | Correct | refuted | 3/3 | 3/3 | S1, S2, S4, S3 | exact | within | 4671 | 9679 | 92 |
| GPT-6 Luna | N1 | 2 | Unsupported conclusive | refuted | 3/3 | 2/3 | S2, S3, S4 | exact | within | 3811 | 9601 | 84 |
| GPT-6.1 Sol | N1 | 2 | Valid inconclusive | inconclusive | 3/3 | 3/3 | S1, S2, S3, S4 | exact | within | 11040 | 9597 | 270 |
| GPT-6 Luna | N1 | 3 | Unsupported conclusive | refuted | 3/3 | 2/3 | S2, S3, S4 | exact | within | 3636 | 9599 | 85 |
| GPT-6.1 Sol | N1 | 3 | Correct | refuted | 3/3 | 3/3 | S1, S2, S4, S3 | exact | within | 6635 | 9597 | 160 |
| GPT-6 Luna | N2 | 1 | Unsupported conclusive | confirmed | 3/3 | 1/3 | S2, S3 | exact | within | 3811 | 9536 | 84 |
| GPT-6.1 Sol | N2 | 1 | Correct | confirmed | 3/3 | 3/3 | S1, S2, S3, S4 | exact | within | 7082 | 9534 | 154 |
| GPT-6 Luna | N2 | 2 | Unsupported conclusive | confirmed | 3/3 | 2/3 | S2, S3, S4 | exact | within | 3729 | 9538 | 89 |
| GPT-6.1 Sol | N2 | 2 | Correct | confirmed | 3/3 | 3/3 | S1, S2, S3, S4 | exact | within | 6374 | 9536 | 134 |
| GPT-6 Luna | N2 | 3 | Unsupported conclusive | confirmed | 3/3 | 2/3 | S1, S2, S3 | exact | within | 3453 | 9536 | 84 |
| GPT-6.1 Sol | N2 | 3 | Correct | confirmed | 3/3 | 3/3 | S1, S2, S3, S4 | exact | within | 5811 | 9538 | 119 |

The three links are suppression after the drag, the fresh click, and the
`tabs.ts` selection decision. The score file lists the state and coverage
of each link, along with the bounded reason or the missing premise for
each accepted response.


## What limited each profile

Luna produced valid envelopes and valid receipt aliases in all six
trials. Its raw verdict matched the expected label in two N1 trials
and all three N2 trials. None met the citation criterion. Five missed
`S1`, the listener wiring needed for the fresh-click link. Two missed
`S4`, the binding from the rendered anchor or button to `#activate`.
All six fall in the table's **Other** column as unsupported conclusive
answers. The N1 first repetition also got the raw verdict wrong.
In the two N1 refutations Luna described the click itself as clearing
suppression, whereas the new `mousedown` clears it before the click
handler. In N2 repetition three it reported a cleared fresh-click state
while describing the later consumption of the flag. These judgment
problems overlap the citation failures. The mutually exclusive scores
retain the first failed scoring gate.

Sol cited all four receipts on both trees. Its two correct N1
refutations identify the new `mousedown`, `#finishDrag()` and the
subsequent selection. All three N2 confirmations identify preservation
on the new `mousedown` and the early return before selection dispatch.
The remaining N1 answer is a valid inconclusive. It asks for evidence
that Overview's `mousedown` reaches the viewport bound to `#down`.

That last premise exposes a boundary of the historical packet. `S1`
shows attachment of `#down` to the local `viewport` and `S4` shows
items rendered under `.bar`. The preserved ranges omit controller
lines 21–25, where `update` selects the host's `.bar` as that
viewport. The preregistered range oracle counts the wiring and item
handler ranges it specified. This audit records the omitted selector
without changing the scoring or adding a fragment after measurement.
The frozen Chromium control independently observed a selection for the
fresh click in N1 and none in N2. Those observations stayed evaluator-only.

## Decision

Neither profile passed. Luna scored 0/3 on each tree under the evidence
criterion. Sol scored 2/3 correct refutations of N1 and 3/3 correct
confirmations of N2. The new contract accepted all 12 responses with
the anchor intact and measured usage within the budget in every trial.
There were no contract rejections, expirations or unknown usage.

This is judgment on the prepared historical sources for one seeded
candidate. A later evidence-control design can make viewport identity
explicit before freezing the packet and make the receipt-to-link
mapping explicit in scoring. Automatic recovery and handoff from
detection remain separate evaluations. PR #951 remains a draft and
production activation remains disabled.
