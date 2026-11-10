# #895 configureVitest lifecycle replay results

[Preregistration](preregistration.md) ·
[Frozen commit](https://github.com/vypdev/copilot/commit/17f7e6fe13c186fc03807391ca43951f08033a32) ·
[Simulated controls](runner-control.json) ·
[Historical and augmented coverage checks](coverage-controls.json) ·
[Trial ledger](trials.jsonl) · [Causal review](causal-review.json) · [Scores](scores.json)

All six Sol sessions completed the single provider call. All six had
metered usage within budget, preserved the fixed candidate and anchor,
and recorded zero GitHub write attempts. The simulated verifier validated
the exact source tuples and bound receipt aliases. The historical packets
satisfy the retained evidence groups and fail the three lifecycle groups.
Both augmented packets satisfy every deterministic evidence group.

| Tree | Historical packet bytes | Augmented packet bytes | Prompt bytes | Dependency bytes |
| --- | ---: | ---: | ---: | ---: |
| original | 14,320 | 12,861 | 14,033 | 8,833 |
| mutant | 14,829 | 13,370 | 14,542 | 8,833 |

The respective ceilings were 15,500 packet bytes, 21,500 prompt bytes,
and 9,000 bytes for the dependency part. The packet uses a shared file
table and trimmed source windows. Every receipt continues to bind the
exact archive member and range to the lockfile, version, candidate and tree.

| Sol outcome | Historical | Augmented |
| --- | ---: | ---: |
| Supported original refutations | 3/3 | 2/3 |
| Supported mutant confirmations | 0/3 | 0/3 |

| Trial | Accepted verdict | Citation groups | Budget | Wall ms | Input / output tokens | Result |
| --- | --- | ---: | --- | ---: | --- | --- |
| original/1 | inconclusive | 10/10 | within | 23261 | 11,148 / 717 | `valid-inconclusive` |
| mutant/1 | inconclusive | 10/10 | within | 16403 | 11,196 / 473 | `valid-inconclusive` |
| original/2 | refuted | 10/10 | within | 11833 | 11,068 / 428 | `correct` |
| mutant/2 | — | 0/10 | within | 26575 | 11,196 / 688 | `final-response-shape` |
| original/3 | refuted | 10/10 | within | 14626 | 11,068 / 507 | `correct` |
| mutant/3 | — | 0/10 | within | 20686 | 11,196 / 596 | `final-response-shape` |

## What limited the replay

Both accepted original refutations explained how Vitest resolves project
exclusions, awaits `configureVitest`, and initializes V8 from the effective
options. They also explained why the story is absent from the JSON summary
and why that prevents an unexpected inventory key. The remaining original
response was a valid inconclusive. It requested the hook implementations
and their effects even though it could trace the timing.

The valid mutant inconclusive connected the hook timing, the exception for
`button.stories.ts` and the inventory failure if the story entered the
report. Its missing premise was the concrete CSF source and its survival
through coverage collection and remapping. The [source audit](story-source-audit.json)
verifies that both pinned trees contain the CSF definition, with a default
metadata export and named story. Those lines were absent from the measured
packets. The earlier pinned execution remains the evaluator's evidence for
the resulting report entry.

The other two mutant calls completed at the transport layer. The application
rejected both with `final-response-shape`. That check covers the top-level
fields and types, the verdict and the one-line reason bound. The frozen
runner retains the failure and transport facts without retaining the
rejected response body, so the individual failed predicate is undetermined.
Neither rejected reply supplies an accepted verdict or verified citations.
There were no accepted unsupported conclusions or incorrect judgments.

**Sol did not meet the entry criterion for runner-directed search.**
This was a prepared-packet regression. Runner-directed search remains
a separate iteration. The PR stays in draft and production activation
remains disabled.

## Verify the published score

From this directory, with Python 3.10 or later:

```sh
shasum -a 256 -c frozen.sha256
python3 score.py --check-controls
python3 score.py trials.jsonl causal-review.json > /tmp/coverage-895-lifecycle-score.json
cmp /tmp/coverage-895-lifecycle-score.json scores.json
```
