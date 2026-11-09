# Prepared-chain second-call diagnostic results

The [preregistered commit](https://github.com/vypdev/copilot/commit/c271981177f08da0c4c72a966ac0c3ca4aba7504)
froze the paired prompts, response schema, 48 slots, dispatch order,
evaluator and limits before measurement. The runner submitted only
second calls. The journal records 45 completed,
1 failed, 2 expired and 0
aborted slots, with 2 unmetered attempts and 0 attempts
on the GitHub mutation ports.
[Protocol](preregistration.md) · [Raw trials](trials.jsonl)

## Historical prompt attestation

The selection rule chose the first recorded Sol second attempt with
decisive evidence for each revision. All four reconstructed prompts and
their schema hashes matched the prior ledger. The prepared arms retain
every historical source line and the same candidate, diff and anchor.
They compact duplicate retrieval metadata and add exact source ranges.
[Both frozen packets and hashes](packets.json)

| Revision | Historical trial | Historical prompt SHA-256 | Historical packet bytes | Complete packet bytes |
| --- | --- | --- | ---: | ---: |
| H1 | `2a5db66833bd8aa5` | `ae35d7d640a17e3b698c48734af31a21bcb07a77230e7e24a473429cd37a5e4d` | 12,706 | 14,138 |
| H2 | `17b68ca028cacc59` | `e874039f31288c3a86f7dd584ce639a47cae0f50101e2c5f38ee73cc53ecc572` | 12,706 | 14,138 |
| P1 | `d0b1a3511637246d` | `e8c9f3d65751432dadc411c1f2808bcafd530160ae5547f6567ea94756283e67` | 14,582 | 15,392 |
| P2 | `26a671a1420d7d89` | `bb86e37130986559561b3d664b7752c7c043d25997d6a27948539b7f2f82fabd` | 14,632 | 15,438 |

## Results by revision and model

A correct verdict is a completed response that matches the evaluator.
A usable correct verdict additionally has an exact application anchor,
a cited decisive receipt and a proved budget. A prepared citation
references a new or extended receipt. The anchor is selected by the
application and is scored independently of the model verdict.
Each cell represents three slots.

| Model | Revision | Arm | Verdicts and statuses | Correct | Decisive cited | Prepared cited | Exact anchor | Budget proved | Usable correct |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-6-luna | H1 | historical | 2 confirmed, 1 inconclusive | 0/3 | 3/3 | 0/3 | 3/3 | 3/3 | 0/3 |
| gpt-6-luna | H1 | complete | 3 confirmed | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 | 0/3 |
| gpt-6-luna | H2 | historical | 1 confirmed, 2 inconclusive | 1/3 | 3/3 | 0/3 | 3/3 | 3/3 | 1/3 |
| gpt-6-luna | H2 | complete | 3 confirmed | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| gpt-6-luna | P1 | historical | 1 confirmed, 1 failed, 1 refuted | 1/3 | 2/3 | 0/3 | 3/3 | 3/3 | 1/3 |
| gpt-6-luna | P1 | complete | 2 confirmed, 1 expired | 0/3 | 2/3 | 2/3 | 3/3 | 2/3 | 0/3 |
| gpt-6-luna | P2 | historical | 3 confirmed | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 3/3 |
| gpt-6-luna | P2 | complete | 3 confirmed | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | H1 | historical | 1 expired, 2 refuted | 2/3 | 2/3 | 0/3 | 3/3 | 2/3 | 2/3 |
| gpt-6.1-sol | H1 | complete | 3 refuted | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | H2 | historical | 3 inconclusive | 0/3 | 3/3 | 0/3 | 3/3 | 3/3 | 0/3 |
| gpt-6.1-sol | H2 | complete | 3 confirmed | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | P1 | historical | 3 refuted | 3/3 | 3/3 | 0/3 | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | P1 | complete | 3 refuted | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | P2 | historical | 3 inconclusive | 0/3 | 3/3 | 0/3 | 3/3 | 3/3 | 0/3 |
| gpt-6.1-sol | P2 | complete | 3 inconclusive | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 | 0/3 |

## Effect of supplying the chain

The preregistered positive signal requires more usable mutant
confirmations and at least as many usable original refutations.
The arrows compare historical to complete packets. Every count is
out of three.

| Model | Pair | Correct original refutations | Correct mutant confirmations | Usable original refutations | Usable mutant confirmations | Positive signal |
| --- | --- | --- | --- | --- | --- | --- |
| gpt-6-luna | #913 | 0 → 0 | 1 → 3 | 0 → 0 | 1 → 3 | yes |
| gpt-6-luna | #880 | 1 → 0 | 3 → 3 | 1 → 0 | 3 → 3 | criterion unmet |
| gpt-6.1-sol | #913 | 2 → 3 | 0 → 3 | 2 → 3 | 0 → 3 | yes |
| gpt-6.1-sol | #880 | 3 → 3 | 0 → 0 | 3 → 3 | 0 → 0 | criterion unmet |

## Premises left unresolved

These are the frozen classifier's safe codes from validated inconclusive
responses. A response can carry several signals. The journal records
whether the signal came from the next step or reason and retains both
digests. Raw provider text stays outside the artifacts.

| Model | Revision | Arm | Inconclusive trials | Premise signals |
| --- | --- | --- | ---: | --- |
| gpt-6-luna | H1 | historical | 1 | 1 `input-to-parser-binding`, 1 `precision-six-reachability` |
| gpt-6-luna | H2 | historical | 2 | 2 `precision-six-reachability` |
| gpt-6.1-sol | H2 | historical | 3 | 3 `precision-six-reachability` |
| gpt-6.1-sol | P2 | historical | 3 | 2 `accumulation-contract`, 3 `event-to-controller-binding` |
| gpt-6.1-sol | P2 | complete | 3 | 2 `accumulation-contract`, 1 `displayed-english-label`, 2 `missing-source`, 3 `page-replacement-effect` |

## Latency, usage and failures

Gross input includes cached tokens. p95 uses observed case wall time
and known token usage. No retry was admitted.

| Model | Arm | Completed / failed / expired / aborted | Wall p95 ms | Gross input p95 | Known gross input / output totals | Unmetered |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| gpt-6-luna | historical | 11 / 1 / 0 / 0 | 20,837 | 12,093 | 144,599 / 2,099 | 0 |
| gpt-6-luna | complete | 11 / 0 / 1 / 0 | 42,010 | 12,466 | 136,519 / 2,151 | 1 |
| gpt-6.1-sol | historical | 11 / 0 / 1 / 0 | 42,012 | 12,170 | 132,663 / 1,874 | 1 |
| gpt-6.1-sol | complete | 12 / 0 / 0 / 0 | 15,747 | 12,466 | 148,891 / 2,512 | 0 |

The retained failure codes were 1 `citation-integrity`, 2 `provider-turn-timeout`.

All 48 slots retained the application-selected anchor. Every metered
attempt stayed under the gross input and output ceilings, with maxima
of 12,466 and 272 tokens. The two provider timeouts have unknown usage.
The citation integrity failure was metered and yielded no usable verdict.

## Interpretation

**#913.** Sol moved from zero to three usable confirmations on H2 and
from two to three usable refutations on H1. Its three historical H2
inconclusives all identified six-place reachability. With the prepared
packet, all three H2 confirmations cited both the extended form receipt
and the new material adapter receipt alongside the decisive parser
receipt. Luna also cited both supplemental receipts in all three H2
confirmations and improved from one to three confirmations. It refuted
zero originals in either arm and returned three false positives on the
prepared original. Its H2 gain satisfies the numerical comparison
because the historical refutation count was already zero. It does not
demonstrate reliable discrimination between the original and mutant.

For automatic recovery, the evidence target in this pair is the
effective producer of the field's precision and the consumer that
passes that value and the raw input into the canonical parser. Follow
the accepted precision in the material adapter through the input and
completion handler to the parser and the resulting error or intent.
The diagnostic supplied the adapter and form links together, so it
cannot attribute the improvement to one span. The successful H2
confirmations and the historical missing-premise codes motivate
testing those links separately.

**#880.** Luna already confirmed all three P2 runs and kept that count
with the prepared packet. Its usable P1 refutations fell from one to
zero, with two false positives and one timeout on the prepared original.
Sol refuted all three originals in both arms and left all six mutant
responses inconclusive. All three prepared P2 responses cited the
English label and both prepared receipts. The historical event-binding
signal disappeared, while page-replacement effect appeared in all three
prepared inconclusives and the accumulation contract in two. These
codes summarize requests for proof. They do not establish that a
particular span was missing from the prompt.

The next review of this test should distinguish two assertions. The
event-to-controller path and the page replacement can be verified in
source or with a pinned two-page UI trace. Whether replacing the page
is a defect also depends on whether the displayed wording promises
accumulation. The local controller control establishes the page
transition and does not establish that product promise. If the case
continues to use a wording-only mutation, the evaluator should state
what makes the English wording a contract and the verifier should
identify that premise separately from the observed list effect. If an
independent product requirement is unavailable, a successor fixture
could explicitly guarantee retention and pin a before/after rendered
list test. This run retains its frozen oracle and scores.
[Earlier pagination control](../partial-diagnostic/pagination-controls.jsonl)

## Scope of the result

This was a closed second-call diagnostic with auditor-prepared source
and a compacted retrieval envelope. It gives a paired positive result
for Sol on #913, a mutant-only gain for Luna on #913, and no paired gain
on #880. Automatic retrieval, the separate reserved-pair advancement
test and production qualification remain pending. Production
activation remains disabled.

#918 stayed outside all 48 slots. Its read-path result is conditional
on a retired schedule with a retained slot already being persisted.
The reviewed normal commands do not establish that precondition.
[Separate retirement audit](../partial-diagnostic/retirement-audit.md)
