# #892 Sol retrieval with adapter limits in the prompt

[Preregistration](preregistration.md) · [Frozen commit](https://github.com/vypdev/copilot/commit/c176fc322316dfdaea1c07ce7e1c4f3a1cf41559) ·
[Deterministic controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Receipt audit](receipt-audit.json) · [Causal audit](causal-review.json) · [Scores](scores.json)

The prompt now reports the common adapter's inclusive 80-line and
4,400-byte fragment limits. Preflight reproduced the historical first
prompt hashes, isolated the instruction as the only byte change and
verified the same initial packet and schema. The line-limit control
rejected the historical request before opening a file. The byte-limit
control passed admission and failed when the adapter opened a larger
fragment. The short fixture read delivered the decisive evidence.
The measured replay audited 10 distinct receipts
against the pinned blobs. Chromium observations stayed in the evaluator.

## Historical comparison

| Pilot | Requests passing admission | Line rejections | Fragment byte rejections | Link retrieved | Link delivered | Link cited | Supported correct | Calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Historical | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 30 |
| Limits disclosed | 18 | 0 | 0 | 6 | 6 | 6 | 6 | 30 |

Admission counts include admissible fixed-arm requests. Only the
on-demand arm may execute one. The two budget rejection columns
distinguish the admission limit from the adapter's fragment limit.

## Three-arm result

| Arm | Tree | Admitted | Link retrieved / delivered / cited | Supported correct | Valid inconclusive | Unsupported conclusive | Proven budget | Median wall ms | Gross input / output |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fixed | N1 | 3/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 6747 | 28,654 / 277 (3/3 measured) |
| fixed | N2 | 3/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 7507 | 28,507 / 314 (3/3 measured) |
| repeat | N1 | 3/3 | 0/3 / 0/3 / 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 15416 | 56,701 / 791 (3/3 measured) |
| repeat | N2 | 3/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 17071 | 56,319 / 824 (3/3 measured) |
| on-demand | N1 | 3/3 | 3/3 / 3/3 / 3/3 | 3/3 | 0/3 | 0/3 | 3/3 | 11769 | 59,998 / 574 (3/3 measured) |
| on-demand | N2 | 3/3 | 3/3 / 3/3 / 3/3 | 3/3 | 0/3 | 0/3 | 3/3 | 18997 | 60,133 / 898 (3/3 measured) |

N1 is the original and N2 is the mutant. Full link coverage requires
viewport selection and listener installation at each stage. Correctness
also requires cited support for the rest of the chain, the expected
verdict and causal reasoning, exact anchor and proven budget.
All measured GitHub write attempts remained at zero.

## Per trial

| Trial | Exact request target | Admission | Adapter or control status and fragments | Link retrieved / delivered / cited | Verdict and score | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| N1-1-fixed | head readBlob navigation-overflow.ts 1–80 | admitted | unresolved · fixed-single-call | no / no / no | — · `unresolved-request` | within |
| N1-1-repeat | head readBlob navigation-overflow.ts 1–80 | admitted | withheld · control-no-new-source | no / no / no | inconclusive · `valid-inconclusive` | within |
| N1-1-on-demand | head readBlob navigation-overflow.ts 1–80 | admitted | provided · navigation-overflow.ts 1–80 | yes / yes / yes | refuted · `correct` | within |
| N1-2-repeat | head readBlob navigation-overflow.ts 1–80 | admitted | withheld · control-no-new-source | no / no / no | inconclusive · `valid-inconclusive` | within |
| N1-2-on-demand | head readBlob navigation-overflow.ts 1–65 | admitted | provided · navigation-overflow.ts 1–65 | yes / yes / yes | refuted · `correct` | within |
| N1-2-fixed | head readBlob navigation-overflow.ts 1–80 | admitted | unresolved · fixed-single-call | no / no / no | — · `unresolved-request` | within |
| N1-3-on-demand | head readBlob navigation-overflow.ts 1–65 | admitted | provided · navigation-overflow.ts 1–65 | yes / yes / yes | refuted · `correct` | within |
| N1-3-fixed | head readBlob navigation-overflow.ts 1–75 | admitted | unresolved · fixed-single-call | no / no / no | — · `unresolved-request` | within |
| N1-3-repeat | head readBlob navigation-overflow.ts 1–80 | admitted | withheld · control-no-new-source | no / no / no | inconclusive · `valid-inconclusive` | within |
| N2-1-fixed | head readBlob navigation-overflow.ts 10–88 | admitted | unresolved · fixed-single-call | no / no / no | — · `unresolved-request` | within |
| N2-1-repeat | head readBlob navigation-overflow.ts 1–80 | admitted | withheld · control-no-new-source | no / no / no | confirmed · `unsupported-conclusive` | within |
| N2-1-on-demand | head readBlob navigation-overflow.ts 1–80 | admitted | provided · navigation-overflow.ts 1–80 | yes / yes / yes | confirmed · `correct` | within |
| N2-2-repeat | head readBlob navigation-overflow.ts 1–80 | admitted | withheld · control-no-new-source | no / no / no | confirmed · `unsupported-conclusive` | within |
| N2-2-on-demand | head readBlob navigation-overflow.ts 1–80 | admitted | provided · navigation-overflow.ts 1–80 | yes / yes / yes | confirmed · `correct` | within |
| N2-2-fixed | head readBlob navigation-overflow.ts 9–88 | admitted | unresolved · fixed-single-call | no / no / no | — · `unresolved-request` | within |
| N2-3-on-demand | head readBlob navigation-overflow.ts 1–79 | admitted | provided · navigation-overflow.ts 1–79 | yes / yes / yes | confirmed · `correct` | within |
| N2-3-fixed | head readBlob navigation-overflow.ts 9–88 | admitted | unresolved · fixed-single-call | no / no / no | — · `unresolved-request` | within |
| N2-3-repeat | head readBlob navigation-overflow.ts 1–80 | admitted | withheld · control-no-new-source | no / no / no | confirmed · `unsupported-conclusive` | within |

The ledger preserves all request fields, both call attempts where
applicable, the exact receipts sent and cited, and all usage and
failure records. The score file separates each of the two link
components and includes the bounded verdict rationale.


## Decision

Sol passed the known-case control. All 18 requests named the same
controller file and passed admission. The six on-demand calls to
the adapter returned one in-budget fragment each, using the model's
requested ranges without adjustment. All six final calls received
and cited the viewport selection and listener, as well as the
remaining causal evidence. N1 produced 3/3 supported refutations.
N2 produced 3/3 supported confirmations. The causal audit confirmed
that the fresh mousedown clears suppression before the item click
in N1, and preserves it in N2 so the click returns before dispatch.
Every trial preserved the anchor, demonstrated the case budget and
recorded zero write attempts.

The historical run stopped all 18 requests at line admission.
This run had zero line rejections and zero fragment byte rejections.
The fixed arm logged six admissible requests and ended without
verdicts. The repeat arm issued three valid inconclusives in N1
and three unsupported confirmations in N2. The latter describe
the expected behavior if the fresh mousedown invokes `#down`,
but the delivered sources do not prove that premise. No control
trial had a supported conclusive verdict.

## Recommended reserved case

Use [#895](https://github.com/vypdev/copilot/issues/895) to design a
reserved original/mutation pair. The chain spans the project test
configuration, resolved Vitest and Storybook collection patterns,
and the strict runtime coverage inventory. It differs from browser
event wiring. Pin the exact historical head, dependency lock and
CI inputs, and use an independent run of the resolved configuration
and coverage inventory to establish ground truth. Select a mutation
only after that control demonstrates that the CSF input reaches the
inventory and fails the existing check. Keep the expected paths and
observations evaluator-only. Freeze the common adapter and disclosed
limits before inspecting the mutation or prompting the verifier.
This replay on #892 does not qualify a reserved pair or a full review.

PR #951 remains a draft and production activation stays disabled.
