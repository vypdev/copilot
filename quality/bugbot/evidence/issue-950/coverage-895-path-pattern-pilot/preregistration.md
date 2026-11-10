# #895 path-pattern regression preregistration

Repeat the [historical #895 diagnostic](../coverage-895-pilot/results.md)
at `10c9e80aab89f89648dab34bf69aef9b8072b4ac` with the common Git adapter
from [`d78caa770`](../git-path-pattern/results.md). This is a known-case
regression. Production activation remains disabled and PR #951 stays
in draft.

The fixtures are the original `fc143a7fce3e6d50647804f29b0ed0af27fa0e32`
and mutant `06145cbe19f52fa5b9c61fecd381bcbe36421241`, with the existing
candidate, comparison, tree and lock bindings and the right-side anchor
at line 14 of `tooling/coverage.mjs`. The initial packet is byte-identical
to the corresponding historical packet. It contains three tracked Git
fragments and ten dependency fragments authenticated against the lockfile
and the exact resolved packages. It withholds the effective Vitest project
configuration. The new first-call schema and instructions describe
`pathPattern` and filtered `literal` with generic examples and the
effective request and Git adapter limits. The measured runner forwards
the original typed request. It never adds a query, path filter, read,
or source. The adapter can normalize the authorized root alias.

The [runner controls](runner-control.json) freeze both trees' first-call
packet, prompt and schema hashes. They use the actual trial entry point
with a simulated transport and record the hashes of both control second
turns and the two new search forms on both trees. Measured second-turn
hashes are generated from the actual requests and receipts and logged
before sending. The control checks cover the same initial prompt and
schema in all six model/arm combinations per tree, the same admission
for malformed requests, receipt membership, cross-revision, version and
lock rejection, a rejected second request, full package and prompt sizes,
and the dry-run write trap. An admitted request in the repeat control
returns status with no new sources. Only on-demand uses the Git adapter.

## Fixed schedule and budgets

The [slot list](slots.json) preserves the previous 36 slots and batch
order. Use GPT-6 Luna and GPT-6.1 Sol at low effort, with three repetitions
per tree, model and arm. Each batch starts Luna then Sol concurrently
and finishes before the next batch. Each provider call starts a new
closed session with the pinned [SDK and CLI](manifest.json). There are
no runner retries, one read round and at most two provider calls per
trial. The maximum across the schedule is 60 calls. The fixed arm stops
after its first call and records unresolved requests. The two other
arms use the same admission, including the status for a denied request.

Use the previous 42-second per-call and 90-second per-trial deadlines,
32,768 gross input tokens and 4,096 output tokens per trial, and 15,500
serialized packet and 21,500 prompt bytes per call. This includes
retrieval status and receipt aliases. The unchanged Git adapter caps
apply to listing, file and match counts, time, bytes, fragment size
and receipts. Preserve attempts with unavailable usage, failed calls
and expired budgets. Unproven budgets fail qualification. All write
ports fail on use and every measured trial must record zero writes.

## Evaluator only

Reuse the historical [scoring code](../coverage-895-pilot/score.py) and
[preregistered rubric](../coverage-895-pilot/preregistration.md#evaluator-only).
Coverage outputs, decisive ranges and expected verdicts are evaluator
inputs. The model never receives them. Independently review each reason
against the effective original exclusion or mutant override, how it affects
the V8 coverage report, and what the inventory check does with that report.
Bind the manual audit to the recorded reason digest. Keep technical
failures, valid inconclusives, unsupported conclusions and incorrect
judgments separate. Log the request's search modes, admission, retrieval,
delivery, citation, verdict and first stopping stage for each slot.
Do not substitute tests or retry on a measured failure.

Evaluate each profile on its own. The on-demand arm must produce three
supported refutations of the original and three supported confirmations
of the mutant and exceed each control. Every correct result requires
retrieval, delivery and citation of the decisive configuration, the four
material links, correct causal explanation, preserved anchor and proven
budget. Compare results with the historical pilot without pooling the
two runs. A pass supports testing a different reserved pair. Production
activation stays disabled.

## Reproduction

Use Node 24.20.0, the pinned clean SDK and CLI, and the
[fixture installation and authenticated archives](../coverage-895-reserved/results.md#reproduce).
Run from this directory. The measured command requires a clean checkout
of the exact preregistration commit and creates a fresh ledger.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs "$LAB" "$LAB/archives" --check
BUGBOT_PILOT_SDK="$PINNED_SDK" node run.cjs "$LAB" "$LAB/archives" --run "$OUT" "$FREEZE"
python3 score.py "$OUT/trials.jsonl" causal-review.json
```
