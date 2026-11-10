# #895 complete-evidence regression results

[Preregistration](preregistration.md) ·
[Frozen commit](https://github.com/vypdev/copilot/commit/24d4c3e72a30da8ee54a7e063066ef33ab6ae708) ·
[Simulated controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Causal review](causal-review.json) · [Scores](scores.json)

The first phase recorded 12 one-call trials with known usage and budget
compliance in all 12, and zero GitHub write attempts. Every response
cited all six preregistered source groups and kept the fixed anchor.
Within each tree the two models received identical prompts and schemas.

| Tree | Receipts | Packet bytes | Prompt bytes |
| --- | ---: | ---: | ---: |
| original | 16 | 14,320 | 15,631 |
| mutant | 16 | 14,829 | 16,140 |

| Model | Tree | Verdict labels | Cited groups | Supported correct | First failing stage |
| --- | --- | --- | ---: | ---: | --- |
| gpt-6-luna | original | refuted 3 | 3/3 | 1/3 | causal-explanation 2 |
| gpt-6-luna | mutant | refuted 3 | 3/3 | 0/3 | judgment 3 |
| gpt-6.1-sol | original | refuted 3 | 3/3 | 3/3 | — |
| gpt-6.1-sol | mutant | confirmed 1, inconclusive 2 | 3/3 | 0/3 | causal-explanation 1, valid-inconclusive 2 |

| Trial | Verdict | Coverage groups | Budget | Wall ms | Input / output tokens | Result |
| --- | --- | ---: | --- | ---: | --- | --- |
| original/1/complete/gpt-6-luna | refuted | 6/6 | within | 6961 | 11,432 / 188 | causal-explanation |
| original/1/complete/gpt-6.1-sol | refuted | 6/6 | within | 10557 | 11,516 / 296 | correct |
| mutant/1/complete/gpt-6-luna | refuted | 6/6 | within | 5799 | 11,576 / 136 | judgment |
| mutant/1/complete/gpt-6.1-sol | confirmed | 6/6 | within | 13628 | 11,578 / 319 | causal-explanation |
| original/2/complete/gpt-6-luna | refuted | 6/6 | within | 5928 | 11,430 / 147 | correct |
| original/2/complete/gpt-6.1-sol | refuted | 6/6 | within | 14641 | 11,430 / 337 | correct |
| mutant/2/complete/gpt-6-luna | refuted | 6/6 | within | 8410 | 11,574 / 213 | judgment |
| mutant/2/complete/gpt-6.1-sol | inconclusive | 6/6 | within | 14718 | 11,656 / 457 | valid-inconclusive |
| original/3/complete/gpt-6-luna | refuted | 6/6 | within | 5125 | 11,430 / 137 | causal-explanation |
| original/3/complete/gpt-6.1-sol | refuted | 6/6 | within | 9267 | 11,430 / 222 | correct |
| mutant/3/complete/gpt-6-luna | refuted | 6/6 | within | 5244 | 11,576 / 167 | judgment |
| mutant/3/complete/gpt-6.1-sol | inconclusive | 6/6 | within | 27766 | 11,576 / 471 | valid-inconclusive |

## What stopped qualification

Luna produced the correct original label three times. One reason
established the actual exclusion chain. The other two failed to
establish that exclusion or attributed it to an extension list
that includes `ts`. All three mutant trials incorrectly refuted
the hypothesis. In two, the explanation identified the button
exception but treated a defect limited to that one story as
incompatible with an existential claim.

Sol supported all three original refutations. It confirmed one
mutant and gave an explanation consistent with the evaluator's
observations. The supplied excerpts did not establish the premise
that the hook's exclusion rewrite became effective before provider
initialization. That confirmation fails the causal support check.
The other two mutant trials returned valid inconclusives and
independently identified the same timing gap.

The packet contained the project hook and the exclusion matcher,
but omitted the lifecycle that links them. The evaluator checked
that link in the lock-authenticated Vitest 5.1.0 archives. The
Vitest CLI awaits preparation, which starts the context and awaits
project attachment. Attachment invokes and awaits
`configureVitest` after resolving the configuration and its test
exclusions. The normal test start subsequently initializes the
coverage provider. V8's base initializer takes the effective
coverage options, and its matchers read those options. See the
[evaluator-only lifecycle audit](lifecycle-audit.json) for the
exact files, ranges and hashes. These excerpts were absent from
all measured prompts. The independent pinned execution remains
the oracle for the unexpected CSF report entry and inventory
failure on the mutant.

**Phase 2 was gated out.** Neither model achieved three supported
refutations and three supported confirmations in phase 1. The
runner-directed search has no measured trials in this iteration.
The PR stays in draft and production activation remains disabled.

## Verify the recorded score

From this directory, with Python 3.10 or later:

```sh
shasum -a 256 -c frozen.sha256
python3 score.py trials.jsonl causal-review.json > /tmp/coverage-895-complete-score.json
cmp /tmp/coverage-895-complete-score.json scores.json
```
