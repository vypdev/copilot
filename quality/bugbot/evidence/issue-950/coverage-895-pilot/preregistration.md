# #895 reserved diagnostic preregistration

This diagnostic uses the [validated fixture](../coverage-895-reserved/results.md)
and its [reserved protocol](../coverage-895-reserved/protocol.md) from
`f3f9b768889d5cb1af1826e0d5f7fad1d4b1f831`. The original is
`fc143a7fce3e6d50647804f29b0ed0af27fa0e32` and the mutant is
`06145cbe19f52fa5b9c61fecd381bcbe36421241`. The candidate stays at
right-side line 14 of `tooling/coverage.mjs`. The [controls](runner-control.json)
record the exact trees, comparison, lock blob, initial receipts and
packet, prompt and schema hashes. The initial packet uses all ten
published dependency receipts and three Git receipts. It withholds
the effective Vitest project configuration on both trees.

The preparation step runs the published dependency control and
compares the resulting attestation to the frozen artifact. The
runner then reconstructs the same fragments from the authenticated
package files. The wire shares provenance across fragments, and the
application retains the full receipts. It validates candidate,
operation, head and tree for all receipts. It also verifies the
version, integrity, lock blob and exact prepared artifact for
dependencies. The application binds the final response to the
original anchor. The final schema permits exactly the delivered
aliases, and application validation rejects a second request and
foreign citations independently of that schema.

The initial instructions expose the adapter's effective 80-line and
4,400-byte fragment caps without naming the file or range to request.
All three arms and both models see identical first-call bytes and
schemas on a given tree. Only the on-demand arm executes a model
request through the common Git adapter. It forwards the actual
receipts in order, deduplicating IDs already delivered. The mock
checks use the real adapter in both trees and verify all aliases,
with the retrieval status included in packet and prompt metering.
The scored provider path uses the same runner, initial packet,
admission rule and final schema generator.

## Slots and budgets

The [manifest](manifest.json) and [slot list](slots.json) fix 36
trials, three repetitions per tree, model and arm. Each batch has
Luna followed by Sol in the start order, with those two trials
running concurrently. Arm order rotates by repetition and the
runner waits for each batch before starting the next. Both models
use low effort and the same pinned SDK and CLI from the manifest.
Every call opens a fresh closed session. Each trial has one
read round, no retries and at most two calls, so the full run has
at most 60 calls. Use a 42-second per-call deadline and the
90-second, 32,768 gross input token and 4,096 output token limits
per trial. Bound the complete serialized packet to 15,500 bytes
and the prompt to 21,500 bytes, including status and aliases.
The original adapter's file, scan, evidence and receipt caps apply.
The fixed arm records an unresolved request and stops. The repeat
arm runs the same admission and returns status without new code.
Zero write attempts are required. Unknown usage fails qualification.

## Evaluator only

The evaluator uses the expected refutation of the original and
confirmation of the mutant, the published coverage and inventory
outputs, and the following rubric. The runner loads none of the
coverage outputs, labels or decisive ranges into any model call.

- Collection requires the two addon fragments and the tracked
  Storybook configuration with the collection and addon declarations.
- Exclusion requires the three Vitest resolver and matcher fragments
  and the decisive Git configuration. In the original, require
  lines 12 and 14 of `vitest.config.ts`. In the mutant, require
  lines 12–20 and 23 for the hook and effective configuration.
- Reporting requires the five coverage filter, remap, merge, report
  context and JSON writer fragments.
- Inventory requires lines 7–11 of the independent inventory test
  and lines 36–38 of the checker.

A conclusive verdict needs all four citation groups. Audit the
reason separately for the appropriate effective exclusion,
consequence for the generated report and consequence for the
inventory. A valid inconclusive names what is missing. Preserve
technical failures and unsupported conclusions as separate outcomes.
Report the first missing stage and the recorded failure detail.
Each model must achieve three supported original refutations and
three supported mutant confirmations in the on-demand arm and
exceed both controls. Each qualifying trial must retrieve, deliver
and cite the decisive configuration, sustain the full chain, keep
the anchor and prove the budget. This diagnostic leaves activation
disabled.

## Reproduction

Prepare the clean fixture installations and archives with the
[fixture instructions](../coverage-895-reserved/results.md).
Use Node 24.20.0, the clean SDK and the pinned Codex CLI. Run from
this evidence directory. The last command runs the model pilot
only from the clean preregistration commit.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs "$LAB" "$LAB/archives" --check
BUGBOT_PILOT_SDK="$PINNED_SDK" node run.cjs "$LAB" "$LAB/archives" --run "$OUT" "$FREEZE"
python3 score.py "$OUT/trials.jsonl" causal-review.json
```
