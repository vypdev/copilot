# #895 complete-evidence regression preregistration

This is phase 1 of the #895 regression after
[`d7b16c637`](../coverage-895-path-pattern-pilot/results.md). Use the existing
pinned original `fc143a7fce3e6d50647804f29b0ed0af27fa0e32`, mutant
`06145cbe19f52fa5b9c61fecd381bcbe36421241`, operation and candidate,
and the right-side anchor at line 14 of `tooling/coverage.mjs`.
The prepared packet adds the project configuration, the runtime-extension
declaration and the package test command. It retains the three initial
Git receipts and ten lock-authenticated dependency receipts. The generated
reports, execution outputs and expected verdicts stay with the evaluator.
No model receives a tool or a further evidence round.

The [controls](runner-control.json) freeze the trees, candidate, Git
ranges, dependency receipts, packet, prompt and schema hashes. The same
final-only contract accepts confirmed, refuted and inconclusive. The
application binds the response to the fixed identity and anchor. Tests
validate the citation allowlist, reject duplicates and foreign citations,
another request, cross-revision and cross-candidate receipts, and verify
the dry-run write trap. The two models receive identical prompt and
schema bytes for each tree. Both packets and prompts fit the original
byte ceilings.

## Slots and scoring

The [slot list](slots.json) schedules 12 one-call trials, three per tree
and model. GPT-6 Luna and GPT-6.1 Sol use low effort and the same pinned
SDK and CLI. Start the two models in order within each tree/repetition
pair and wait for both before the next pair. Each call starts a fresh
closed session. There are no retries. Use 42 seconds per call, 90 seconds
per trial, 32,768 gross input tokens, 4,096 output tokens, 15,500
serialized packet bytes and 21,500 prompt bytes. Unknown usage fails
qualification. Keep every attempted call and require zero write attempts.

For each profile, require three supported original refutations and three
supported mutant confirmations. Use the four material links of the
[historical rubric](../coverage-895-pilot/preregistration.md#evaluator-only)
and additionally require citations for the actual runtime-extension
declaration and the test command connecting the report and inventory.
Audit the reason independently and bind it to its recorded digest.
For the original, automatic exclusions remain effective and keep the CSF
entry out of the V8 summary. The independent inventory therefore sees no
unexpected story key. For the mutant, the project hook changes that
exclusion, so the report includes an unexpected CSF key and the check
fails. The explanation must describe the effective behavior, its effect
on the report and the inventory result. A correct label with a wrong
reason, unsupported premise, damaged anchor or unproven budget fails.

The prepared-evidence result measures the verdict gate only. Phase 2 is
preregistered separately and runs only for a profile that satisfies this
gate. Both phases leave the PR in draft and production activation disabled.

## Reproduction

Prepare the [pinned fixtures and archives](../coverage-895-reserved/results.md#reproduce).
Use Node 24.20.0, Python 3.10 or later, and the pinned SDK and CLI. Run from
this directory. The measured run requires the exact clean freeze.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs "$LAB" "$LAB/archives" --check
BUGBOT_PILOT_SDK="$PINNED_SDK" node run.cjs "$LAB" "$LAB/archives" --run "$OUT" "$FREEZE"
python3 score.py "$OUT/trials.jsonl" causal-review.json
```
