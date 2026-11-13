# Effective-origin and common Git diagnostic results

The [preregistered commit](https://github.com/vypdev/copilot/commit/9b41e7d3fec023b7c9adf30ae4afd1575514c5ed)
froze all 72 slots, both revision pairs, both profiles, the initial packets,
source and attempt budgets, and the separate evaluator. The verifier never
received the oracle or probe results. All 72 slots reached a recorded outcome.
There were 62 completed, eight expired and two failed slots, with zero
write attempts. Neither profile advanced. Production remains disabled.
[Preregistration and reproduction](preregistration.md) · [Raw trial journal](trials.jsonl)

## Deterministic controls

At `580811b61`, Python constructed `AlphaDatabase` after the module alias
and the resolver supplied `BetaRepo.active_key`. The supported direct alias
now resolves to Alpha and returns the binding witness. An unchanged import
still resolves to Beta. Unsupported dynamic rebinding yields
`module-binding-unproven`. The simulated runner returns that status without
a receipt claiming an effective implementation.
[Regression](../causal-replay/reproduce-module.cjs) · [Baseline](baseline.json) ·
[Simulated controls](runner-controls.jsonl)

All 12 original #918 requests retained the SQLite chain and
exact anchor in recorded order. The maximum was
37 opened files,
295,080
discovery/source bytes and
2,197 ms per lookup.
The evaluator attested the recovered blobs and receipts against each pinned
tree. All 66 focused tests passed and Graphify completed with partial
extraction warnings. [Replay controls](controls.jsonl)

The reserved #913 probe executed the parser and its guard extracted from the
pinned TypeScript source. H1 accepts the six-digit value and H2 rejects it.
Both accept the five-digit control and reject the seven-digit control. The
probe exercises the parser, while the review packet contains the source
of the caller and completion form. [Parser controls](parser-controls.jsonl) ·
[Historical #913 report](https://github.com/vypdev/copilot/issues/913)

## Measured diagnostic

The recovery column counts only a receipt spanning the decisive source on
the correct head and tree. The citation column counts use of that receipt in
a final validated verdict. Anchor counts record the exact application-selected
location, independently of the outcome. A correct verdict plus anchor only
counts for the profile gate when its budget is proved. Receipt recovery and
citation scores include all planned slots, including failures.

| Model | Arm | Revision | Typed requests | Retrieval statuses | Decisive recovery | Decisive citation | Verdicts and statuses | Correct verdict | Exact anchor | Budget proved | Max wall ms | Max known input / output |
| --- | --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| gpt-6-luna | fixed | T1 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 2/3 | 51,242 | 18,440 / 202 |
| gpt-6-luna | fixed | T2 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 2/3 | 57,891 | 9,167 / 194 |
| gpt-6-luna | fixed | H1 | 2/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 0/3 | 60,770 | 9,870 / 163 |
| gpt-6-luna | fixed | H2 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 0/3 | 61,465 | 9,859 / 153 |
| gpt-6-luna | repeat | T1 | 3/3 | 1 denied, 2 withheld | 0/3 | 0/3 | 2 expired, 1 inconclusive | 0/3 | 3/3 | 0/3 | 88,818 | 18,482 / 648 |
| gpt-6-luna | repeat | T2 | 3/3 | 1 denied, 2 withheld | 0/3 | 0/3 | 3 expired | 0/3 | 3/3 | 0/3 | 88,814 | 9,171 / 180 |
| gpt-6-luna | repeat | H1 | 2/3 | 1 none, 2 withheld | 0/3 | 0/3 | 1 expired, 2 inconclusive | 0/3 | 3/3 | 0/3 | 88,809 | 19,802 / 316 |
| gpt-6-luna | repeat | H2 | 2/3 | 1 none, 2 withheld | 0/3 | 0/3 | 1 failed, 2 inconclusive | 0/3 | 3/3 | 0/3 | 66,168 | 20,006 / 306 |
| gpt-6-luna | on-demand | T1 | 3/3 | 2 budget, 1 provided | 1/3 | 1/3 | 1 expired, 1 inconclusive, 1 refuted | 1/3 | 3/3 | 0/3 | 88,812 | 21,463 / 314 |
| gpt-6-luna | on-demand | T2 | 3/3 | 2 provided, 1 unresolved | 2/3 | 2/3 | 1 failed, 2 inconclusive | 0/3 | 3/3 | 1/3 | 63,004 | 21,362 / 375 |
| gpt-6-luna | on-demand | H1 | 1/3 | 1 budget, 2 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 0/3 | 61,221 | 19,801 / 307 |
| gpt-6-luna | on-demand | H2 | 3/3 | 2 budget, 1 provided | 1/3 | 0/3 | 1 expired, 2 inconclusive | 0/3 | 3/3 | 1/3 | 88,813 | 19,825 / 304 |
| gpt-6.1-sol | fixed | T1 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 8,766 | 9,213 / 190 |
| gpt-6.1-sol | fixed | T2 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 7,635 | 9,155 / 239 |
| gpt-6.1-sol | fixed | H1 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 7,900 | 9,880 / 247 |
| gpt-6.1-sol | fixed | H2 | 3/3 | 3 none | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 11,566 | 9,925 / 261 |
| gpt-6.1-sol | repeat | T1 | 3/3 | 3 withheld | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 15,858 | 18,563 / 394 |
| gpt-6.1-sol | repeat | T2 | 3/3 | 3 withheld | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 17,829 | 18,465 / 471 |
| gpt-6.1-sol | repeat | H1 | 3/3 | 3 withheld | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 18,851 | 19,975 / 469 |
| gpt-6.1-sol | repeat | H2 | 3/3 | 3 withheld | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 15,712 | 19,842 / 406 |
| gpt-6.1-sol | on-demand | T1 | 3/3 | 3 provided | 3/3 | 3/3 | 3 refuted | 3/3 | 3/3 | 3/3 | 18,371 | 21,537 / 424 |
| gpt-6.1-sol | on-demand | T2 | 3/3 | 3 provided | 3/3 | 3/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 21,125 | 21,371 / 492 |
| gpt-6.1-sol | on-demand | H1 | 3/3 | 3 budget | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 16,884 | 19,985 / 446 |
| gpt-6.1-sol | on-demand | H2 | 3/3 | 3 budget | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 | 15,608 | 19,837 / 395 |

## Attempts and budgets

Gross input includes cached input. The percentiles use observed per-slot wall
time and known gross input. Unknown token usage remains visible and does
not qualify as a proved budget.

| Model | Arm | Completed / expired / failed / aborted | Attempts | Unknown attempts | Write attempts | Wall p95 ms | Gross input p95 | Gross input total known | Output total known |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-6-luna | fixed | 12 / 0 / 0 / 0 | 20 | 8 | 0 | 61,465 | 18,440 | 123,393 | 1,945 |
| gpt-6-luna | repeat | 5 / 6 / 1 / 0 | 32 | 17 | 0 | 88,818 | — | 153,550 | 2,943 |
| gpt-6-luna | on-demand | 9 / 2 / 1 / 0 | 31 | 12 | 0 | 88,813 | 21,362 | 199,207 | 3,085 |
| gpt-6.1-sol | fixed | 12 / 0 / 0 / 0 | 12 | 0 | 0 | 11,566 | 9,925 | 114,253 | 2,478 |
| gpt-6.1-sol | repeat | 12 / 0 / 0 / 0 | 24 | 0 | 0 | 18,851 | 19,975 | 230,185 | 4,814 |
| gpt-6.1-sol | on-demand | 12 / 0 / 0 / 0 | 24 | 0 | 0 | 21,125 | 21,537 | 247,798 | 4,869 |

The reserved arm hit the fragment byte limit in 9 of 12
on-demand slots. In a separate post-hoc, zero-model probe on each tree,
a literal search for `taskQuantity` in the parser file reproduced the
same failure by merging the windows around its definition and later call.
Searching for the exact declaration returned lines 9–47 in 2,696 bytes.
A typed read of lines 28–30 returned the decisive function in 178 bytes.
These probes explain the observed retrieval limitation and do not contribute
to the measured scores.

## Decision by profile

The reserved pair alone determines whether a profile can enter full-review
evaluation. The threshold is all six correct and metered, exact anchors,
decisive recovery and citation on all six, and a strict improvement over
each control.

| Profile | Correct and budget-proved H1/H2 fixed · repeat · on demand | On-demand recovery | On-demand citation | Full-review evaluation |
| --- | --- | ---: | ---: | --- |
| gpt-6-luna low | 0/6 · 0/6 · 0/6 | 1/6 | 0/6 | Criterion unmet |
| gpt-6.1-sol low | 0/6 · 0/6 · 0/6 | 0/6 | 0/6 | Criterion unmet |

- `gpt-6-luna` recorded H1 0/3 correct verdicts and 3/3 exact anchors and H2 0/3 correct verdicts and 3/3 exact anchors.

- `gpt-6.1-sol` recorded H1 0/3 correct verdicts and 3/3 exact anchors and H2 0/3 correct verdicts and 3/3 exact anchors.

Production activation remains disabled. Historical reproduction and
qualification in full review, including the independent 174-case corpus,
remain separate gates. [Owning SDD](../../../../../specs/bugbot-analysis-publication-and-autofix.md#950-on-demand-evidence-anchors-and-qualification)
