# #950 bounded source-and-CI retest results

**Activation remains gated.** The revised runner addressed the missing causal
source and repeated prompt payload. Qualification still requires intact paired
comparisons, preservation of every positive control at its fixed anchor,
sufficient historical baseline reproduction and the independent detection corpus.

The protocol, runner, scores policy and source packets were committed and pushed
in [`6b2ddc0`](https://github.com/vypdev/copilot/commit/6b2ddc0e2a678a29e40ebb88520a1922fc2720be)
before the first measured call at `2026-11-09T07:27:21Z`.
Replay finished at `2026-11-09T07:37:18Z`. Full review
ran from `2026-11-09T07:37:18Z` to
`2026-11-09T08:02:54Z`. The unchanged v2 primary and
expansion results remain independently inspectable.

[Preregistration](preregistration.md) · [Manifest](manifest.json) ·
[Locked inputs](frozen.sha256) · [Machine scores](scores.json) · [Output checksums](results.sha256) ·
[Previous run](../results-v2.md) · [27-issue traceability](../traceability.md)

## What caused the v2 losses

| Full-review source/CI | Positive exposures | Detected | Lost before detection | Lost to invalid trial | Inconclusive | Retained |
|---|---:|---:|---:|---:|---:|---:|
| Luna | 9 | 7 | 2 | 5 | 1 | 1 |
| Sol | 9 | 9 | 0 | 3 | 5 | 1 |

The v2 packet never supplied the exact unchanged edge call of the pytest
listener function. A local signature-only binding control accepted the exact
call on F1 and raised for the missing keyword-only argument on F2 before the
function body. The revised F1 and F2 packets both include that call. V2 also
omitted the exact-head restore test that shows the pre-batch snapshot,
retained history and conflict required before a fresh preview. Both revised
S packets include that test's source, independently of the old local SQLite
probe. V2's generic failure code prevents attribution of each invalid attempt.
The new runner uses closed citation IDs, a one-candidate response and specific
validation diagnostics. It counts unique detector partitions separately from
native retries and preserves detection diagnostics on later failure.

The v2 controlled reconstruction rebuilt application-verifier prompts of
32,670–55,746 UTF-8 bytes. They included the complete detector request and
the Codex coding-agent instructions applied separately. The largest gross
provider input in each model's full review occurred in a single verifier call.
The historical ledger lacks a server-side breakdown of those spikes. A synthetic
no-repository control reduced fixed input from 10,559 to 6,642 tokens on Luna
and from 11,250 to 6,642 on Sol. These controls isolate the replacement
instructions and closed tool envelope. The v3 replay/full results below measure
the complete intervention on real comparisons. [Canary ledger](canaries.json)

## All measured slots

**161 completed, 12 failed and 43 aborted.**
Each of the 216 preassigned slots appears once. Measured provider output with
missing usage stays unaccounted. A failed or aborted attempt cannot count as a
clean result. Local controls and access canaries are separate. No GitHub write
port was invoked by the measured dry-run workflow.

[Replay · Luna](trials-frozen-replay-gpt-6-luna.jsonl) · [Replay · Sol](trials-frozen-replay-gpt-6.1-sol.jsonl) · [Full · Luna](trials-full-review-gpt-6-luna.jsonl) · [Full · Sol](trials-full-review-gpt-6.1-sol.jsonl)

Each table row covers 18 slots and nine positive exposures. FP means an
active output unsupported by the frozen oracle, including off-target claims.
Off-target outputs were not independently adjudicated. Exact uses the original
scoring anchor or the preregistered deletion fallback. Verifier-only p95 uses
subject-level totals for slots with observed closed-verifier usage and at least
one such call. Machine scores additionally give p50, maximum, and a separate
zero-call-inclusive input distribution. A missing counter or an invalid attempt
prevents qualification. Gross input includes any cached provider input.

| Phase | Model | Arm | Complete / failed / aborted | FP | Detected | Retained | Exact | Inconclusive | Full p95 s | Added p95 s | Added input / output p95 | Observed total input / output | Calls missing usage |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Replay | Luna | Current | 13 / 0 / 5 | 3 | 9 | 7 | 7 | 0 | 180.1 | — | — / — | 550,640 / 5,493 | 20 |
| Replay | Luna | Context | 5 / 1 / 12 | 0 | 9 | 2 | 2 | 3 | 65.5 | 65.5 | 7,275 / 263 | 43,363 / 753 | 13 |
| Replay | Luna | Source/CI | 5 / 2 / 11 | 0 | 9 | 4 | 4 | 1 | 50.1 | 50.1 | 9,354 / 397 | 61,086 / 1,121 | 13 |
| Replay | Sol | Current | 16 / 0 / 2 | 3 | 9 | 7 | 7 | 0 | 180.1 | — | — / — | 1,260,885 / 7,469 | 8 |
| Replay | Sol | Context | 18 / 0 / 0 | 0 | 9 | 3 | 3 | 9 | 18.8 | 18.8 | 14,402 / 311 | 151,744 / 2,961 | 0 |
| Replay | Sol | Source/CI | 18 / 0 / 0 | 0 | 9 | 8 | 8 | 1 | 33.9 | 33.9 | 17,506 / 527 | 180,651 / 3,866 | 0 |
| Full | Luna | Current | 16 / 0 / 2 | 3 | 7 | 7 | 6 | 0 | 298.4 | — | — / — | 2,484,974 / 25,142 | 18 |
| Full | Luna | Context | 16 / 0 / 2 | 0 | 6 | 2 | 2 | 5 | 225.1 | 35.6 | 7,381 / 307 | 2,237,461 / 19,628 | 13 |
| Full | Luna | Source/CI | 10 / 6 / 2 | 0 | 9 | 3 | 3 | 0 | 228.5 | 36.0 | 9,412 / 146 | 1,945,135 / 17,945 | 22 |
| Full | Sol | Current | 15 / 2 / 1 | 0 | 9 | 7 | 6 | 0 | 320.8 | — | — / — | 4,201,783 / 26,274 | 9 |
| Full | Sol | Context | 14 / 0 / 4 | 0 | 8 | 3 | 3 | 5 | 225.1 | 11.1 | 7,339 / 219 | 2,463,389 / 16,730 | 15 |
| Full | Sol | Source/CI | 15 / 1 / 2 | 0 | 9 | 6 | 5 | 3 | 225.1 | 21.4 | 9,350 / 399 | 3,037,898 / 20,694 | 8 |

## Change from v2

| Phase | Model | V2 → v3 retained / 9 | V2 → v3 verifier input p95 | V3 prompt bytes p95 |
|---|---|---:|---:|---:|
| Replay | Luna | 5 → 4 | 108,474 → 9,354 | 11,043 |
| Replay | Sol | 3 → 8 | 92,811 → 17,506 | 11,043 |
| Full | Luna | 1 → 3 | 213,032 → 9,412 | 11,532 |
| Full | Sol | 1 → 6 | 434,624 → 9,350 | 11,227 |

The time limit is 90 seconds per subject, with input p95 at most 32,768 and
output p95 at most 4,096. Current runs its production literal verifier when
applicable. Its latency and tokens are included in route totals. Added costs in
the table describe the independent closed verifier only.

## Remaining gates

| Phase | Model | Source/CI positive losses | Historical baseline alerts / premises | Complete comparison | Exactly anchored positives | FP reduction by repetition vs current | FP reduction vs context | Overhead sample / qualified |
|---|---|---|---|---|---:|---|---|---|
| Replay | Luna | 5 integrity-aborted | 3 / 1 | no | 4/9 | 1 / 1 / 1 | 0 / 0 / 0 | within bounds / no |
| Replay | Sol | 1 verifier-inconclusive | 3 / 1 | no | 8/9 | 1 / 1 / 1 | 0 / 0 / 0 | within bounds / yes |
| Full | Luna | 6 integrity-failed | 2 / 2 | no | 3/9 | 3 / 0 / 0 | 0 / 0 / 0 | within bounds / no |
| Full | Sol | 1 retained-other-anchor, 3 verifier-inconclusive | 0 / 0 | no | 5/9 | 0 / 0 / 0 | 0 / 0 / 0 | within bounds / no |

Positive paired differences favor the evidence arm. A qualified efficacy claim
also needs valid trials, at least three historical baseline alerts spanning two
premises, and strictly fewer false positives in two repetitions with no increase
in the third. Per-subject positive outcomes, the number detected and the final precision,
recall, F1, location, severity, category and Brier scores are in the machine report.
The independent 174-case model corpus remains unmeasured for this retest.

Sol confirmed an actual pytest regression on the newly added `*` separator
at line 130. The frozen exact anchor remains the required parameter at line 131.
For Unicode, an inconclusive decision identified a missing caller even while
correctly explaining the regex change. A separate Node 24.20.0 control invoked
the unchanged `buttonState` with U+1F600. The reviewed original preserved the
label and the paired mutation threw `ButtonInputError` (`invalid_button`). The
caller blob `0c95b46eb16c732531cacbab5a4b4279396dc7d0` was identical in U1 and U2.
The control and caller location were recorded after freezing v3 and stayed
outside its measured packets and scores.
[Exact caller source](https://github.com/vypdev/ha-ui/blob/e3f49b5c540771caf68ef2f3afca799cff26f389/packages/core/src/button-contracts.ts#L13-L22)

The failure ledger records `provider-time-or-output-budget` (32), `production-dry-run-failed` (23).
In Luna full review, all nine controls were detected. Each of the six lost
positives reached the closed verifier and expired at the 36-second deadline
without a completed turn or usage. Sol reached a verdict on all nine and
left three inconclusive. Current retained seven controls per model.
The 36-second deadline was frozen before measurement, and calls without
reported usage cannot support the overhead qualification. The trial ledger
preserves the observed cause and tool/session counters. It cannot distinguish
provider-side latency from streaming or transport delays when no response arrived.
The primary gate failures prevent qualification even with additional historical
subjects. The previous #859 and #861 v2 expansions remain part of the audit.

## Reproduce

Materialize the six [locked subject checkouts](../subjects.lock.json) with the
existing [freeze script](../freeze-subjects.py). Use the [audited SDK](manifest.json)
source and the pinned Codex CLI. From `quality/bugbot/evidence/issue-950/v3`:

```sh
python3 prepare-evidence.py /tmp/pilot-subjects > /tmp/pilot-v3-packets.json
diff -u evidence.json /tmp/pilot-v3-packets.json
shasum -a 256 -c frozen.sha256
node --test verification.test.cjs
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/pilot-subjects preflight
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/pilot-subjects frozen-replay /private/path/trials.jsonl
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/pilot-subjects full-review /private/path/trials.jsonl
python3 score.py /private/path/trials.jsonl --public /private/path/public-trials.jsonl
```

Six deterministic verifier-policy checks and 18 production dry-run preflights
passed. The local evaluator ran 134 tests. The Action-published owning SDD and
production activation policy are outside this experimental change.
