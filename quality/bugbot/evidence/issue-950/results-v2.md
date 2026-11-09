# #950 source-and-native-CI pilot v2

**Decision: do not advance to activation.** The primary matrix recorded all
216 slots, including 50 failed and 1
aborted trials. A failed slot was never counted as a clean win. The paired
efficacy, exact-anchor, completeness and independent corpus gates must all
qualify before production settings can be chosen.

The pre-measurement v2 commit was
`34e2fbb4dcad3ffc21e65b9acf7e6adc348b8b8d`. The first expansion was frozen in
`95679a89eea9c0ad694b68706bcf914ef77b5245`. The conditional #861 expansion
was frozen in `b7bba36e676c3be5f87936ef2e38e028b6e8d54a`.
Recompute the tracked digests before reproduction.
The protocol uses production detection and the current literal verifier for
the baseline. It compares two fresh closed verifiers, one with original
context and one with frozen source and matching CI. No probe is supplied in
any measured cohort. The pilot runner used fail-on-call GitHub write ports.
Eighteen primary preflights, six per expansion, two access
canaries and the local oracles are separate evidence.

## Primary comparison

Counts are per 18-slot group. “FP” means an active prediction unsupported by
the frozen scoring oracle. In full review that also includes off-target
predictions, which were not independently adjudicated as new defects. Each
group has nine positive exposures. Detection and final misses are separate.
“Exact” counts positive outputs at the preregistered anchor or permitted
deletion-side fallback. “Inc.” counts inconclusive dispositions. Time is
wall-clock in seconds. Token totals are observed across the complete route
and include the provider overhead. Missing usage is reported separately.

| Phase | Model | Arm | Complete / failed / aborted | FP | Detected | Retained | Missed at detection / final | Exact | Inc. | Time p50 / p95 (s) | Input / output tokens | Calls missing usage |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| frozen-replay | gpt-6-luna | Current | 18 / 0 / 0 | 10 | 9 | 9 | 0 / 0 | 9 | 0 | 14.9 / 27.6 | 1,076,924 / 10,267 | 0 |
| frozen-replay | gpt-6-luna | Original context | 7 / 11 / 0 | 0 | 9 | 1 | 0 / 8 | 1 | 5 | 9.9 / 27.2 | 1,065,015 / 7,536 | 0 |
| frozen-replay | gpt-6-luna | Application evidence | 16 / 2 / 0 | 2 | 9 | 5 | 0 / 4 | 5 | 4 | 9.8 / 20.5 | 698,558 / 6,510 | 0 |
| frozen-replay | gpt-6.1-sol | Current | 17 / 1 / 0 | 3 | 8 | 8 | 1 / 1 | 8 | 0 | 20.0 / 119.7 | 2,204,300 / 11,766 | 1 |
| frozen-replay | gpt-6.1-sol | Original context | 12 / 6 / 0 | 0 | 9 | 1 | 0 / 8 | 1 | 9 | 12.6 / 28.2 | 881,358 / 5,420 | 0 |
| frozen-replay | gpt-6.1-sol | Application evidence | 18 / 0 / 0 | 0 | 9 | 3 | 0 / 6 | 3 | 6 | 11.9 / 20.6 | 939,724 / 5,610 | 0 |
| full-review | gpt-6-luna | Current | 18 / 0 / 0 | 1 | 7 | 7 | 2 / 2 | 7 | 0 | 33.0 / 63.9 | 2,903,487 / 25,806 | 0 |
| full-review | gpt-6-luna | Original context | 11 / 7 / 0 | 0 | 8 | 0 | 1 / 9 | 0 | 2 | 40.3 / 70.4 | 3,492,082 / 28,323 | 0 |
| full-review | gpt-6-luna | Application evidence | 11 / 7 / 0 | 0 | 7 | 1 | 2 / 8 | 1 | 2 | 34.0 / 70.4 | 3,144,614 / 26,880 | 0 |
| full-review | gpt-6.1-sol | Current | 14 / 4 / 0 | 1 | 6 | 6 | 3 / 3 | 4 | 0 | 45.1 / 298.6 | 5,842,880 / 35,617 | 7 |
| full-review | gpt-6.1-sol | Original context | 11 / 7 / 0 | 0 | 9 | 0 | 0 / 9 | 0 | 5 | 44.7 / 142.2 | 4,661,820 / 27,408 | 1 |
| full-review | gpt-6.1-sol | Application evidence | 12 / 5 / 1 | 0 | 9 | 1 | 0 / 8 | 1 | 5 | 50.6 / 225.0 | 4,489,176 / 25,686 | 4 |

### Qualification checks

Positive differences mean the source/CI arm produced fewer unsupported outputs.
The completeness rule still applies. A numerical decrease from invalid output
does not qualify as a paired win.

| Phase | Model | Baseline historical alerts / distinct premises | FP reduction vs current by repetition | FP reduction vs original context | All positive anchors | Qualified paired reduction |
|---|---|---:|---|---|---|---|
| frozen-replay | gpt-6-luna | 10 / 4 | 1 / 3 / 4 | -1 / -1 / 0 | No | No |
| frozen-replay | gpt-6.1-sol | 3 / 1 | 1 / 1 / 1 | 0 / 0 / 0 | No | No |
| full-review | gpt-6-luna | 1 / 1 | 0 / 0 / 1 | 0 / 0 / 0 | No | No |
| full-review | gpt-6.1-sol | 0 / 0 | 0 / 0 / 1 | 0 / 0 / 0 | No | No |

The following metrics cover the proposed arm on this narrow cohort. The
separate unchanged corpus was not rerun with both models. Its existing floors
are still required for activation. Incremental verification cost includes the
closed verifier calls. A blank entry means no measured call reached that
stage or had usage available.

| Phase | Model | Precision | Recall | F1 | Location | Severity | Category | Brier | Added time p50 / p95 (s) | Added input p50 / p95 | Added output p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| frozen-replay | gpt-6-luna | 0.714 | 0.556 | 0.625 | 1.000 | 1.000 | 1.000 | 0.260 | 9.8 / 20.5 | 38165.0 / 108474.0 | 322.5 / 917.0 |
| frozen-replay | gpt-6.1-sol | 1.000 | 0.333 | 0.500 | 1.000 | 1.000 | 1.000 | 0.003 | 11.9 / 20.6 | 45814.5 / 92811.0 | 300.5 / 512.0 |
| full-review | gpt-6-luna | 1.000 | 0.111 | 0.200 | 1.000 | 1.000 | 1.000 | 0.005 | 0.0 / 14.1 | 29567.0 / 213032.0 | 352.5 / 780.0 |
| full-review | gpt-6.1-sol | 1.000 | 0.111 | 0.200 | 1.000 | 1.000 | 1.000 | 0.000 | 6.5 / 20.3 | 88879.5 / 434624.0 | 427.5 / 1493.0 |

The preregistered overhead limits are p95 90 seconds, 32,768 input tokens and
4,096 output tokens per subject. The application-evidence arm exceeded the
input limit in all four primary comparisons. The reported input counts are
gross provider usage and can include cached tokens. No billing estimate was
made. The wall-time and output p95 samples stayed within their individual
limits, but incomplete attempts prevent a qualified overhead result. See the
[machine scores](scores-v2.json) and [all primary slots](trials-v2.md).
When usage is missing the row cannot support an overhead qualification.
The runner retained the bounded status and usage record for every attempt.
Several failures have only the generic `runner-contract-failed` diagnostic.
Their exact rejected response is unavailable in the published evidence.

## First predeclared expansion

Sol reproduced only one historical premise in frozen replay. The next
predeclared pair was #859. Its genuine missing-parent-key control failed
SQLite's exact schema statements outside the model. This expansion added
72 slots without replacing any primary outcome.
The [expansion protocol](expansion-859/protocol.md),
[slots](expansion-859/trials.jsonl) and
[machine scores](expansion-859/scores.json) are separate.

| Phase | Model | Combined baseline historical alerts / premises | Baseline sufficient after expansion | Current / context / evidence FP in expansion | Current / context / evidence positives retained |
|---|---|---:|---|---|---|
| frozen-replay | gpt-6-luna | 10 / 4 | Yes | 0 / 0 / 0 | 3 / 0 / 2 |
| frozen-replay | gpt-6.1-sol | 3 / 1 | No | 0 / 0 / 0 | 3 / 0 / 0 |
| full-review | gpt-6-luna | 2 / 2 | No | 1 / 0 / 0 | 2 / 0 / 1 |
| full-review | gpt-6.1-sol | 0 / 0 | No | 0 / 0 / 0 | 3 / 0 / 0 |

## Second predeclared expansion

At least one baseline comparison was still insufficient after #859. The #861
pair added 72 slots. Its exact Git-tree oracle found the
unchanged guide at the reviewed head and found no entry for the mutated link
target. Both outcomes were checked outside model input. See the
[protocol](expansion-861/protocol.md), [slots](expansion-861/trials.jsonl) and
[machine scores](expansion-861/scores.json).

| Phase | Model | Combined baseline historical alerts / premises | Sufficient | Current / context / evidence FP in #861 | Current / context / evidence positives retained |
|---|---|---:|---|---|---|
| frozen-replay | gpt-6-luna | 13 / 5 | Yes | 3 / 0 / 0 | 3 / 0 / 2 |
| frozen-replay | gpt-6.1-sol | 6 / 2 | Yes | 3 / 0 / 0 | 3 / 0 / 3 |
| full-review | gpt-6-luna | 2 / 2 | No | 0 / 0 / 0 | 3 / 0 / 1 |
| full-review | gpt-6.1-sol | 0 / 0 | No | 0 / 0 / 0 | 3 / 0 / 2 |

Where baseline reproduction remains insufficient, #867 is next in the frozen
expansion order. Additional pairs cannot repair invalid attempts, missed
positives, or the input budget failure in these frozen cohorts.


The expansions recorded **144** slots, with 116 completed, 28 failed and 0 aborted. The [expansion metrics](expansion-usage-v2.json) record latency, usage, outcomes and anchors by phase, model and arm.

## Approval and official verification

The real approval consumer and policy suites passed 203 cases, including
same-SHA enforcement, a fresh policy read before a possible approval, a
missing trusted policy, later inconclusive and failed attempts, and rollback.
The runtime producer and activation wiring remain gated by pilot qualification.

The issue scope was rejected at 1,220 code points, then accepted at a maximum
of 1,109 with the real capture rule after the one semantic line was wrapped.
The Action retained the first publication `80407b7` and verified revision
`f8de480` on PR #951's native linked branch. The intermediate verification
at `9150e57` reached the separate seed artifact check and failed there.
Restoring the owning SDD to the exact Action revision and keeping the detailed
contract in its reconciliation companion recovered the official assessment.
The successful run at `0b984e8` verified 73 requirements across three batches.

[Original scope failure](https://github.com/vypdev/copilot/runs/128977553335) ·
[Separate artifact mismatch](https://github.com/vypdev/copilot/runs/128985421888) ·
[Successful official run](https://github.com/vypdev/copilot/actions/runs/42563791543)

## Reproduction

Run the preflight with the audit tree and repository inputs. Provide a
private output path. The runner rejects a full phase before the corresponding
replay ledger is complete.

```sh
python3 freeze-subjects.py /path/to/ha-ui /path/to/domus --materialize /tmp/pilot-subjects > /tmp/subject-bindings.json
diff -u subjects.lock.json /tmp/subject-bindings.json
python3 prepare-evidence.py /tmp/pilot-subjects /path/to/pytest-9.2.0/python > /tmp/frozen-packets.json
diff -u evidence-v2.json /tmp/frozen-packets.json
shasum -a 256 -c frozen-v2.sha256
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/pilot-subjects preflight
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/pilot-subjects frozen-replay /private/path/trials.jsonl
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/pilot-subjects full-review /private/path/trials.jsonl
python3 score-pilot.py /private/path/trials.jsonl --public /private/path/public-trials.jsonl
```

For either expansion, copy the frozen packet and bindings to a scratch
directory. Regenerate the detached checkouts with the expansion's
`prepare.py` and the primary bundle as `--engine`. Copy the primary
`run-pilot.cjs` into that directory, apply the expansion's `runner.patch`,
and verify `frozen.sha256` before following the same phase commands.

The historical matrix distinguishes local oracles, model trials and outstanding
case-specific evidence. [Historical traceability](traceability.md)
