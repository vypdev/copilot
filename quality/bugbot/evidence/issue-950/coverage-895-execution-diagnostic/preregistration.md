# #895 authenticated execution diagnostic preregistration

This diagnostic starts from the [verdict contract and execution audit at
`7e98fddb7`](../coverage-895-contract-audit/results.md). It uses original
`fc143a7fce3e6d50647804f29b0ed0af27fa0e32`, mutant
`06145cbe19f52fa5b9c61fecd381bcbe36421241`, the pinned candidate and
operation, and right-side line 14 of `tooling/coverage.mjs`.

Within each tree, the source and execution arms receive identical
authenticated source. It includes the Storybook CSF definition, project
configuration, lifecycle and effective coverage options, V8 filtering and
reporting, and the inventory comparison. The only packet addition in the
execution arm is the bound local execution observation and its alias.
Both arms use the same verdict instructions and fields. The schema
enumerates the aliases supplied in that arm.

## Execution provenance and controls

The application reconstructs the [artifacts](execution-artifacts.json) from
the reports, raw logs, statuses and observer trace at the pinned audit
commit. It authenticates the stored bytes against Git and checks the
decompressed log and original report digests. It independently parses the
JSON key and inventory diagnostics, checks the baseline and observed
outputs agree, and verifies the event order and executed coverage route.
The receipt binds the producer and run identifier, repository, full
head, tree, lockfile blob and digest, resolved versions and integrities,
environment, command, working directory, candidate, operation and
anchor. It retains the raw artifact hashes. This is the local evaluator
record of the pinned execution, with the replay and observer hashes.

The execution packet supplies the actual story key presence, coverage
and inventory exits, inventory diagnostics, and the effective options and
filter/remap/merge observations. Expected verdicts and execution scoring
stay with the evaluator. The [runner controls](runner-control.json)
freeze source receipts, aliases, and packet, prompt and schema hashes.
A simulated verifier cites the delivered execution receipt. The controls
reject altered and incomplete projections, wrong head, tree, lockfile or
command, a forged report hash, altered raw report bytes, and an execution
citation from the source arm. The runner records the rejection code and
field. The verdict validator still uses the fixed UTF-8 byte limits and
logs only the safe rejection metadata.

## Schedule and limits

The [schedule](slots.json) fixes 12 trials, three per tree and arm,
with GPT-6.1 Sol at low effort. Arm order alternates by repetition.
Each slot starts one fresh closed session. There are no retries and no
directed reads. Preserve the pinned SDK, CLI and provider in the
[manifest](manifest.json). Require zero GitHub write attempts.

Use 42 seconds per call and the existing 90-second, 32,768 gross-input
and 4,096 output-token limits per trial. Full packets and prompts remain
within 15,500 and 21,500 UTF-8 bytes. Unknown usage fails qualification.
The existing dependency and source bounds apply. The runner retains
every attempt, including transport failures and rejected verdicts.

## Scoring

Require the correct label, verified candidate and anchor, proven budget,
and citations covering the retained source and lifecycle groups plus the
concrete CSF definition. A causal explanation must connect the effective
configuration and filtering to the report key and its inventory effect.
The source arm can support a source-derived conclusion when those
premises follow from the cited code. If a material premise is unproven,
record an inconclusive. In the execution arm a conclusive result also
requires the execution alias and the correct observed key and inventory
outcome. If the explanation invokes a route, its claims about filtering,
remapping and merging must agree with the supplied trace projection.

Audit each accepted reason independently and bind the review to its
digest. Separate valid inconclusives, invalid responses, incorrect
judgments, insufficient citations and unsupported explanations. Report
supported refutations and confirmations for both arms. The execution
arm meets the diagnostic gate at 3/3 supported original refutations
and 3/3 supported mutant confirmations. The PR stays in draft and
production activation remains disabled.

## Reproduction

Use the [pinned fixtures and archives](../coverage-895-reserved/results.md#reproduce),
Node 24.20.0, Python 3.10 or later, and the pinned SDK and CLI. From this
directory, the measured run requires the exact clean preregistration
commit. `$OUT` must be a fresh directory.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs "$LAB" "$LAB/archives" --check
BUGBOT_PILOT_SDK="$PINNED_SDK" node run.cjs "$LAB" "$LAB/archives" --run "$OUT" "$FREEZE"
python3 score.py "$OUT/trials.jsonl" causal-review.json
```
