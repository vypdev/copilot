# Luna detector and paired #892 verifiers

This is a known-case diagnostic on the [#892 replay](../reserved-navigation-diagnostic/results.md).
It compares a Luna detector followed by Luna or Sol. Production
activation stays disabled. Qualification still requires reserved cases
and a separate full-review evaluation.

Both ha-ui heads, trees, historical base, scoped diffs, line-107
right-side anchor and historical gesture hypothesis come from the
[subject lock](../reserved-navigation-diagnostic/subjects.lock.json).
The [independent Chromium control](../reserved-navigation-diagnostic/browser-control.jsonl)
and the expected per-link states and ranges in the [oracle](oracle.json)
remain evaluator inputs. They never enter the model prompts.

## Detection and handoff

The existing #892 ledger contains verifier replies and a historical seed.
It supplies no attested Luna detection output for these exact two trees.
Use one Luna detection call per revision at medium effort on the scoped
controller diff and the pinned consumer file. The detector receives a
neutral defect-finding prompt, a findings schema, and closed transport.
It sees no seeded hypothesis, verdict labels for the trees, control
observations or evaluator ranges. The two prompts are hashed in the
[runner control](runner-control.json). There is no detector retry.
Apply the same 42-second per-call, 32,768 input and 4,096 output token
limits to each detection. Persist both detection outcomes before starting
verification.

A detected match requires an eligible changed line in the scoped file
and a hypothesis describing outside drag release followed by suppression
of a fresh pointer activation. The matcher is frozen in the runner.
Record the detector's proposed location and select the already pinned
historical line 107 for this comparison. Normalize a match to the
canonical gesture and observable effect. Neither detector explanations,
confidence nor fixes are passed into verification. If the detector
omits the hypothesis or fails, record the omission or failure and use the
same historical candidate in a seeded replay. The output candidate file
and its digest are recorded before either verifier sees it. Report
detected and seeded rows separately.

## Verification matrix

There are three repetitions per tree and verifier, 12 verification
trials total. To fit the fixed total and include the matched-source
control, repetitions one and two are adaptive and repetition three
is matched-source. The matched-source estimates have one observation per
tree and verifier. The [manifest](manifest.json) freezes the slot order.
Run a pair of models concurrently within each revision and repetition.
Use low effort for both verifiers, the pinned SDK and CLI, and a fresh
closed session for every call. Both arms use identical prompt bytes
within each revision and mode. The runner retains the candidate and
receipts across rounds, while the provider calls use fresh sessions.

Each verifier attempts to refute the hypothesis by tracing the reachable
gesture, the condition that may clear suppression, and the observable
selection effect. Start the adaptive verifier with the candidate, anchor,
SHA and diff excerpt. The application can execute up to two rounds of
typed scoped name search, literal search or line reads. This is an
experimental variant of the SDD's single read round. The application
uses the corrected common Git adapter on regular tracked blobs, including
paths outside the diff. Requests choose head or base. Base is allowed
only when the detected claim asserts a regression. The seed is a
behavior hypothesis and does not authorize base reads. The application
binds every receipt to the pinned revision, tree, operation and
candidate and validates every cited ID.

The matched-source control adds four fixed Git fragments per revision
covering the controller wiring and state transitions and the tabs
activation and event wiring. The runner materializes and validates the
exact bytes from pinned Git in preflight. It gives both models the
same complete packet and asks for a verdict in one call with no reads.
The control contains source and the same hypothesis, with no execution
results or expected verdicts.

Use the shared 90-second case, 42-second call, 32,768 gross input token,
4,096 output token and three-provider-call ceilings for each verifier
trial. There are no retries. The two adaptive reads share four seconds,
512 KiB of source, 80 files, 4,096 tree entries, 16 matches, 9,000
evidence bytes and five receipts. Keep the 80-line and 4,400-byte
per-fragment limits, the 15,500-byte full packet and the 21,500-byte
rendered prompt ceilings. Keep every attempt including failures,
timeouts and unknown usage. Dry-run ports fail if invoked.

## Scoring

Record raw verdict, effective verdict, delivered and cited coverage
for each of drag state, fresh click and tabs dispatch, exact anchor,
provider usage and wall time. Coverage uses the union of line ranges
on the reviewed head. Base source can establish a comparison only.
Require a recorded provider turn to count delivery. A conclusive
verdict with missing delivered or cited links scores as inconclusive
and records the missing links alongside the model's own report.
A correct conclusive verdict also requires the concrete per-link
causal account, exact anchor, demonstrated budget and zero side effects.
A refutation on the mutant counts as a discarded real defect in the
raw-verdict audit even if it lacks evidence. Report raw and scored
outcomes separately.

Compare adaptive results as whole-flow outcomes including retrieval.
Use matched-source results separately to compare judgment with the same
evidence. Report per-tree counts and attempt totals without inferring
qualification from this known pair or its small control.

## Reproduce

Use the disposable N1 and N2 checkouts from the reserved navigation
diagnostic and its pinned SDK and CLI.

```sh
d=quality/bugbot/evidence/issue-950/detector-verifier-diagnostic
node "$d/run.cjs" "$SUBJECTS"
node "$d/run.cjs" "$SUBJECTS" "$NEW_OUTPUT_DIRECTORY" "$PREREGISTERED_SHA"
python3 "$d/score.py" "$NEW_OUTPUT_DIRECTORY"
```

The measured command requires the exact clean preregistered commit,
an absent output directory and authorized provider access. It makes
two detector calls and twelve verification trials.
