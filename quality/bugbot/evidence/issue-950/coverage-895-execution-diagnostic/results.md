# #895 authenticated execution diagnostic results

[Preregistration](preregistration.md) ·
[Frozen commit](https://github.com/vypdev/copilot/commit/d077c9e66d717de3e1b4438e31e832bb474340df) ·
[Simulated controls](runner-control.json) · [Execution artifacts](execution-artifacts.json) ·
[Trial ledger](trials.jsonl) · [Causal review](causal-review.json) · [Scores](scores.json)

Sol completed 12 one-call trials with known usage within budget and zero
GitHub write attempts. Both arms received the same authenticated source
for a given tree, including the concrete CSF definition. The execution
arm also received the reconstructed local evaluator observation of the
JSON key, inventory result and tested coverage route. The raw evidence
and its producer remain bound to the earlier audited execution.

| Tree | Arm | Packet bytes | Prompt bytes | Dependency bytes |
| --- | --- | ---: | ---: | ---: |
| original | source | 13,374 | 14,893 | 8,833 |
| original | execution | 14,127 | 15,646 | 8,833 |
| mutant | source | 13,883 | 15,402 | 8,833 |
| mutant | execution | 14,695 | 16,214 | 8,833 |

| Arm | Supported original refutations | Supported mutant confirmations | Valid inconclusive | Contract rejections | Judgment errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| source | 0/3 | 0/3 | 0 | 6 | 0 |
| execution | 1/3 | 3/3 | 0 | 2 | 0 |

| Trial | Accepted verdict | Execution receipt cited | Result | Wall ms | Gross input / output tokens |
| --- | --- | --- | --- | ---: | --- |
| original/1/source | — | — | `byte-limit` on `reason`, 1,472 / 1,400 bytes | 16590 | 11,297 / 531 |
| original/1/execution | — | — | `byte-limit` on `reason`, 1,408 / 1,400 bytes | 12086 | 11,543 / 474 |
| mutant/1/source | — | — | `byte-limit` on `reason`, 1,420 / 1,400 bytes | 12795 | 11,421 / 477 |
| mutant/1/execution | confirmed | yes | correct | 12630 | 11,690 / 459 |
| original/2/execution | refuted | yes | correct | 12501 | 11,541 / 480 |
| original/2/source | — | — | `byte-limit` on `reason`, 1,441 / 1,400 bytes | 15725 | 11,295 / 536 |
| mutant/2/execution | confirmed | yes | correct | 12401 | 11,686 / 458 |
| mutant/2/source | — | — | `byte-limit` on `reason`, 1,408 / 1,400 bytes | 14344 | 11,423 / 477 |
| original/3/source | — | — | `byte-limit` on `reason`, 1,426 / 1,400 bytes | 15514 | 11,293 / 529 |
| original/3/execution | — | — | `byte-limit` on `reason`, 1,466 / 1,400 bytes | 14064 | 11,541 / 485 |
| mutant/3/source | — | — | `byte-limit` on `reason`, 1,447 / 1,400 bytes | 13207 | 11,423 / 496 |
| mutant/3/execution | confirmed | yes | correct | 12861 | 11,690 / 470 |

## Contribution of execution evidence

The three supported mutant confirmations used the execution receipt for
the observed CSF key and inventory exit one. Each connected those facts
to the effective hook rewrite and the tested-source filter, remap and
merge. The supported original refutation used the observed exclusion,
absence of the key and inventory exit zero. All four also cited the
required source and lifecycle groups and preserved the anchor.

The execution arm met the mutant requirement and finished below the
original requirement. Its two remaining original responses exceeded
the 1,400-byte `reason` limit. All six source-only responses hit the same
contract check. The runner retained each measured size and the rejected
field. The rejected bodies remain outside the ledger.

The supported verdicts show how the execution receipt supplies direct
evidence of the actual report and inventory outcome. The source-only
arm produced no contract-valid verdict to audit. This limits what the
comparison establishes about the underlying source-only judgments.
There were no accepted inconclusives or incorrect judgments in either
arm. The execution arm did not meet the combined gate. The PR stays in
draft and production activation remains disabled.

## Verify the record

```sh
shasum -a 256 -c frozen.sha256
python3 score.py trials.jsonl causal-review.json > /tmp/coverage-895-execution-score.json
cmp /tmp/coverage-895-execution-score.json scores.json
```
