# #895 path-pattern regression results

[Preregistration](preregistration.md) ·
[Frozen commit](https://github.com/vypdev/copilot/commit/4bfdb03370b5acd7b6bcd8250ab16757c502d1fb) ·
[Simulated controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Causal review](causal-review.json) · [Scores](scores.json)

The 36 slots recorded 44 provider attempts and zero
GitHub write attempts. The first packet on each tree was identical to
the previous pilot. The prompt and schema exposed the versioned Git
adapter's pattern modes and limits. The runner forwarded the model's
own request without adding sources or filters.

## Historical comparison and decision

All entries below compare on-demand trials. R/D/C means the decisive
configuration was recovered, delivered and cited, respectively.
Correct counts require the unchanged evidence, causal, anchor and
budget rubric. The old pilot admitted zero requests across both profiles.

| Model | Admitted old → new / 6 | R/D/C old → new | Original old → new / 3 | Mutant old → new / 3 | New fixed / repeat correct | New gate |
| --- | ---: | --- | ---: | ---: | --- | --- |
| gpt-6-luna | 0 → 0 | 0 / 0 / 0 → 0 / 0 / 0 | 0 → 0 | 0 → 0 | 0 / 0 | Did not pass |
| gpt-6.1-sol | 0 → 3 | 0 / 0 / 0 → 0 / 0 / 0 | 0 → 0 | 0 → 0 | 0 / 0 | Did not pass |

## Results by model, tree and arm

| Model | Tree | Arm | Admitted / 3 | R/D/C | Supported correct | Outcome counts | Proven budget / 3 | Median wall ms | Gross input / output |
| --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |
| gpt-6-luna | original | fixed | 1 | 0 / 0 / 0 | 0 | valid-inconclusive 2, unresolved-request 1 | 3 | 5641 | 35,320 / 315 (3/3 metered) |
| gpt-6-luna | original | repeat | 0 | 0 / 0 / 0 | 0 | valid-inconclusive 3 | 3 | 6585 | 35,324 / 500 (3/3 metered) |
| gpt-6-luna | original | on-demand | 0 | 0 / 0 / 0 | 0 | valid-inconclusive 3 | 3 | 6518 | 35,320 / 479 (3/3 metered) |
| gpt-6-luna | mutant | fixed | 0 | 0 / 0 / 0 | 0 | valid-inconclusive 3 | 3 | 6187 | 35,348 / 496 (3/3 metered) |
| gpt-6-luna | mutant | repeat | 0 | 0 / 0 / 0 | 0 | valid-inconclusive 3 | 3 | 5914 | 47,756 / 469 (3/3 metered) |
| gpt-6-luna | mutant | on-demand | 0 | 0 / 0 / 0 | 0 | valid-inconclusive 3 | 3 | 6205 | 35,342 / 446 (3/3 metered) |
| gpt-6.1-sol | original | fixed | 3 | 0 / 0 / 0 | 0 | unresolved-request 3 | 3 | 7226 | 35,318 / 395 (3/3 metered) |
| gpt-6.1-sol | original | repeat | 3 | 0 / 0 / 0 | 0 | unsupported-conclusive 3 | 3 | 17525 | 66,784 / 1,030 (3/3 metered) |
| gpt-6.1-sol | original | on-demand | 1 | 0 / 0 / 0 | 0 | unsupported-conclusive 3 | 3 | 12813 | 45,813 / 860 (3/3 metered) |
| gpt-6.1-sol | mutant | fixed | 3 | 0 / 0 / 0 | 0 | unresolved-request 3 | 3 | 8465 | 35,346 / 480 (3/3 metered) |
| gpt-6.1-sol | mutant | repeat | 2 | 0 / 0 / 0 | 0 | unsupported-conclusive 3 | 3 | 17259 | 56,326 / 923 (3/3 metered) |
| gpt-6.1-sol | mutant | on-demand | 2 | 0 / 0 / 0 | 0 | unsupported-conclusive 3 | 3 | 16287 | 56,438 / 908 (3/3 metered) |

## Per trial

| Trial | Chosen mode(s) | Admission | Retrieval result | R/D/C | Verdict | Outcome | First stopping stage | Budget |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| original/1/fixed/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/1/fixed/gpt-6.1-sol | literal, literal | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| original/1/repeat/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/1/repeat/gpt-6.1-sol | name | admitted | withheld · control-no-new-source | 0 / 0 / 0 | refuted | unsupported-conclusive | withheld-control | within |
| original/1/on-demand/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/1/on-demand/gpt-6.1-sol | — | — | — | 0 / 0 / 0 | refuted | unsupported-conclusive | request | within |
| mutant/1/fixed/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/1/fixed/gpt-6.1-sol | literal, literal | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| mutant/1/repeat/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/1/repeat/gpt-6.1-sol | name | admitted | withheld · control-no-new-source | 0 / 0 / 0 | refuted | unsupported-conclusive | withheld-control | within |
| mutant/1/on-demand/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/1/on-demand/gpt-6.1-sol | — | — | — | 0 / 0 / 0 | refuted | unsupported-conclusive | request | within |
| original/2/repeat/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/2/repeat/gpt-6.1-sol | literal | admitted | withheld · control-no-new-source | 0 / 0 / 0 | refuted | unsupported-conclusive | withheld-control | within |
| original/2/on-demand/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/2/on-demand/gpt-6.1-sol | — | — | — | 0 / 0 / 0 | refuted | unsupported-conclusive | request | within |
| original/2/fixed/gpt-6-luna | readBlob | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| original/2/fixed/gpt-6.1-sol | literal | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| mutant/2/repeat/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/2/repeat/gpt-6.1-sol | name | admitted | withheld · control-no-new-source | 0 / 0 / 0 | refuted | unsupported-conclusive | withheld-control | within |
| mutant/2/on-demand/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/2/on-demand/gpt-6.1-sol | literal | admitted | budget · search-file-budget | 0 / 0 / 0 | refuted | unsupported-conclusive | retrieval | within |
| mutant/2/fixed/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/2/fixed/gpt-6.1-sol | literal, literal | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| original/3/on-demand/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/3/on-demand/gpt-6.1-sol | literal | admitted | budget · search-file-budget | 0 / 0 / 0 | refuted | unsupported-conclusive | retrieval | within |
| original/3/fixed/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/3/fixed/gpt-6.1-sol | literal | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| original/3/repeat/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| original/3/repeat/gpt-6.1-sol | literal, literal | admitted | withheld · control-no-new-source | 0 / 0 / 0 | refuted | unsupported-conclusive | withheld-control | within |
| mutant/3/on-demand/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/3/on-demand/gpt-6.1-sol | literal, literal | admitted | budget · search-file-budget | 0 / 0 / 0 | refuted | unsupported-conclusive | retrieval | within |
| mutant/3/fixed/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/3/fixed/gpt-6.1-sol | literal, literal | admitted | unresolved · fixed-single-call | 0 / 0 / 0 | — | unresolved-request | fixed-stop | within |
| mutant/3/repeat/gpt-6-luna | — | — | — | 0 / 0 / 0 | inconclusive | valid-inconclusive | request | within |
| mutant/3/repeat/gpt-6.1-sol | — | — | — | 0 / 0 / 0 | refuted | unsupported-conclusive | request | within |

## Where the new run stopped

Admission improved from 0 of 17 typed requests to 15 of 15. The earlier
pilot rejected the dot scope or the multi-file read. This time both
models' typed requests were admitted. No trial selected either new
pattern form. Luna made one exact-path read request in the fixed arm
and returned 17 valid inconclusives, including all six on-demand slots.
Those six responses named missing evidence and ended at the request stage.

Sol selected unfiltered literal or exact-name targets. Its three on-demand
requests were all unfiltered root literal searches. Each enumerated 660
paths, exceeded the 80-file cap and opened zero blobs. All three exact
configuration names occurred in the repeat control, where code was
withheld by design. Sol returned six unsupported on-demand refutations.
Three matched the original's expected label without establishing the
effective configuration. The other three incorrectly refuted the mutant
by applying the default exclusion without its project override.

Neither profile met the gate. Both retained 0/3 supported original
refutations and 0/3 supported mutant confirmations on demand. The
[simulated controls](runner-control.json) show the adapter can deliver
the decisive configuration when asked through either pattern mode. The
measured run tested the models' choice of query and did not exercise those
modes, so it establishes no gain in automatic recovery for this pair.

All 36 slots had known usage and stayed within budget. No provider or
runner failure was recorded. The 44 calls used 520,435 gross input
tokens and 7,301 output tokens. Production activation remains disabled
and the PR stays in draft.

## Verify the published record

Use Python 3.10 or later for the unchanged baseline rubric.

```sh
shasum -a 256 -c frozen.sha256
python3 score.py trials.jsonl causal-review.json > /tmp/bugbot-895-pattern-scores.json
cmp /tmp/bugbot-895-pattern-scores.json scores.json
```
