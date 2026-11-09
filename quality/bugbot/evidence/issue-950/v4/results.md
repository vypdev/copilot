# #950 expanded source-and-CI pilot v4 results

**Activation remains disabled.** The expanded pilot did not qualify. Full review
reproduced one historical baseline alert with Luna and zero with Sol. The
Source/CI arm correctly anchored 17 and 12 of 21 positives, respectively.
The independent Sol supplement confirmed nine previously inconclusive mutant
findings and retained all nine refutations on the originals. The separate
174-case detection corpus has yet to be run for v4. The Action-published owning
SDD, production code and activation configuration stay outside this change.

The main protocol was committed and pushed in [`19da061`](https://github.com/vypdev/copilot/commit/19da0614fd831f1d2a5afa26f1eafbf122c60dcb)
before the first measured call at `2026-11-09T09:01:49Z`.
The process stopped during replay with 207 recorded slots in 69 complete paired
groups. It resumed at `2026-11-09T09:34:06Z` from the ledger
using the same frozen inputs. Any interrupted work before a group's append
is unmetered and outside recorded call totals. Replay finished at
`2026-11-09T09:45:30Z`. Full review ran from `2026-11-09T09:45:30Z` to
`2026-11-09T10:23:15Z`. The separate source-closure
supplement was registered in [`6e0b61e`](https://github.com/vypdev/copilot/commit/6e0b61e01918c180e6d2715f7b77b32703b7d2f5). The [v2](../results-v2.md)
and [v3](../v3/results.md) trial cohorts remain unchanged.

[Protocol](preregistration.md) · [Manifest](manifest.json) ·
[Input checksums](frozen.sha256) · [Machine scores](scores.json) ·
[Output checksums](results.sha256) · [27-issue traceability](../traceability.md)

## Controls and trial integrity

- The unchanged #919 test at both reviewed heads passed on S1 under Python
  3.14.6, pytest 9.2.0, SQLite 3.53.3 and tzdata 2026.6. On S2 it failed at the
  expected source-absence conflict assertion with `DID NOT RAISE`. This confirms
  the preview behavior of the exact mutant. The model received test source,
  not this execution result.
- Playwright 1.64.1 and Chromium 156.0.8078.4 accepted `enabled:false` for a
  disabled fixture, accepted `enabled:true` for an enabled fixture and rejected
  forcing enabled on the disabled fixture. The dependency tarballs matched the
  consumer lock. The installed matcher, story and original source are separate
  from this synthetic browser control.
- The exact image-channel worker under Python 3.14.6 rejected all four original
  parameters and accepted only integer `1` in the J2 mutation. This run used the
  actual transport source without Docker.
- Nine deterministic verifier policy tests, three adapter tests, 42 production
  dry-run preflights and 134 existing evaluator tests passed. No measured workflow
  invoked a GitHub write port.
- In the synthetic setup, all three Sol canaries and two of three Luna canaries
  completed. The third Luna turn started, then reached the 48-second deadline
  without a terminal event or usage. This indicates the stall can occur without
  repository payload or model output. [Canary ledger](transport-canaries.json)

## Main pilot results

**475 completed, 4 failed, 25 aborted.**
All 504 fixed slots appear once. Each row below covers 42 slots and 21 positive
exposures. FP is an actionable claim unsupported by the frozen scorer. Unknown
usage stays unknown and cannot qualify the budget. Added tokens include only
subjects with measured closed-verifier usage on every call. Shared experimental
inspection time and usage are attributed to each arm as if deployed separately.
The machine report separately counts physical provider calls without double
counting shared inspection. The recorded campaign contains 628 physical
provider calls, 147 without usage. Seconds in the table are rounded to one
decimal place. The Luna Source/CI replay p95 was 90,012 ms.

[Replay · Luna](trials-frozen-replay-gpt-6-luna.jsonl) · [Replay · Sol](trials-frozen-replay-gpt-6.1-sol.jsonl) · [Full · Luna](trials-full-review-gpt-6-luna.jsonl) · [Full · Sol](trials-full-review-gpt-6.1-sol.jsonl)

| Phase | Model | Arm | Complete / failed / aborted | FP | Detected | Retained | Exact | Inconclusive | Total p95 s | Added p95 s | Gross added input / output p95 | Unmetered closed calls | Recovered closed deadlines |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Replay | Luna | Current | 31 / 0 / 11 | 10 | 21 | 17 | 17 | 0 | 180.0 | — | — / — | 0 | 0 |
| Replay | Luna | Context | 38 / 1 / 3 | 1 | 21 | 7 | 7 | 25 | 90.0 | 90.0 | 14,458 / 180 | 27 | 19 |
| Replay | Luna | Source/CI | 38 / 1 / 3 | 1 | 21 | 14 | 14 | 0 | 90.0 | 90.0 | 10,137 / 131 | 33 | 25 |
| Replay | Sol | Current | 40 / 0 / 2 | 9 | 21 | 19 | 19 | 0 | 51.5 | — | — / — | 0 | 0 |
| Replay | Sol | Context | 42 / 0 / 0 | 0 | 21 | 3 | 3 | 30 | 12.6 | 12.6 | 14,458 / 194 | 0 | 0 |
| Replay | Sol | Source/CI | 42 / 0 / 0 | 0 | 21 | 12 | 12 | 9 | 10.6 | 10.6 | 17,562 / 183 | 0 | 0 |
| Full | Luna | Current | 42 / 0 / 0 | 2 | 17 | 16 | 16 | 0 | 142.4 | — | — / — | 0 | 0 |
| Full | Luna | Context | 42 / 0 / 0 | 1 | 19 | 14 | 14 | 7 | 143.5 | 44.1 | 7,669 / 116 | 2 | 2 |
| Full | Luna | Source/CI | 41 / 1 / 0 | 0 | 19 | 17 | 17 | 1 | 159.2 | 62.6 | 10,271 / 165 | 5 | 3 |
| Full | Sol | Current | 39 / 1 / 2 | 1 | 21 | 20 | 19 | 0 | 225.0 | — | — / — | 0 | 0 |
| Full | Sol | Context | 40 / 0 / 2 | 0 | 21 | 3 | 3 | 18 | 134.1 | 8.8 | 7,526 / 160 | 0 | 0 |
| Full | Sol | Source/CI | 40 / 0 / 2 | 0 | 21 | 12 | 12 | 9 | 134.1 | 10.5 | 10,104 / 203 | 0 | 0 |

### Like-for-like v3 comparison

This table uses only the original six subjects in v3 and v4, at the same
three repetitions and fixed positive anchors. V4 improves the evidence and
transport setup jointly, with a narrower S2 replay hypothesis for the same
mutated guard. Full detection in the experimental arms still uses the
production review route with the common experimental guidance. `Expired`
counts closed-verifier attempts, including recovered retries. `Recovered`
counts completed subjects after one or more such attempts. The raw full
results remain available to distinguish detector, literal verifier and closed
verifier failures. The new ledger captures the start and completion of turns,
which do not establish the remote cause of a missing terminal event.

| Phase | Model | Detected v3 → v4 / 9 | Retained v3 → v4 / 9 | Exact v3 → v4 / 9 | Expired v3 → v4 | Recovered v4 |
|---|---|---:|---:|---:|---:|---:|
| Replay | Luna | 9 → 9 | 4 → 6 | 4 → 6 | 13 → 14 | 12 |
| Replay | Sol | 9 → 9 | 8 → 9 | 8 → 9 | 0 → 0 | 0 |
| Full | Luna | 9 → 9 | 3 → 9 | 3 → 9 | 6 → 3 | 3 |
| Full | Sol | 9 → 9 | 6 → 9 | 5 → 9 | 0 → 0 | 0 |

Both models selected the required pytest declaration at line 131 in all three
Source/CI full-review repetitions. The other 12 positive exposures per model
remain part of the expanded qualification gate.

### Historical reproduction and gates

A historical alert in replay is an emitted seeded hypothesis. Only full review
measures historical reproduction with an independently generated candidate.
The gates require at least three baseline alerts across two historical premises,
complete comparisons, two improving repetitions with no regressions and all
21 positive exposures correctly anchored. The ceilings are 90 seconds,
32,768 gross input tokens and 4,096 output tokens for independent verification.
Unknown metering or a failed slot prevents qualification. A subsequent unchanged
174-case model corpus run is a separate detection-quality requirement.

| Phase | Model | Historical baseline alerts / premises | Baseline sufficient | Complete | Exact positives | FP delta vs current | FP delta vs context | Overhead qualified |
|---|---|---:|---|---|---:|---|---|---|
| Replay | Luna | 10 / 4 | yes | no | 14/21 | 3 / 3 / 3 | -1 / 0 / 1 | no |
| Replay | Sol | 9 / 3 | yes | no | 12/21 | 3 / 3 / 3 | 0 / 0 / 0 | yes |
| Full | Luna | 1 / 1 | no | no | 17/21 | 0 / 0 / 2 | 0 / 1 / 0 | no |
| Full | Sol | 0 / 0 | no | no | 12/21 | 0 / 0 / 1 | 0 / 0 / 0 | no |

The thresholds are independent. Evidence insufficiency remains a valid verdict.
The full historical matrix also shows cases for which the current baseline
reproduced none of the original premise even when seeded replay surfaced it.
See case IDs, false-positive deltas, failure reasons, reanchor kinds, p50/p95/max,
and gross/cached costs by model and arm in the machine report.

## Separate Sol source supplement

The main v4 source packet omitted three links in the expanded causal chains.
Sol named the missing SQLite foreign-key initialization, the button's disabled
binding and the worker's first sequence. The supplement adds those immutable
same-head excerpts for both halves of each pair. It reproduced the prompt
hashes of all 18 predecessors before any new request. This evidence-only
replay uses the same candidate, anchor, model, runtime and limits. It stays
outside the main scores and cannot qualify full review or baseline reproduction.

[Supplement protocol](sol-source-supplement/protocol.md) ·
[Supplement ledger](sol-source-supplement/trials.jsonl) ·
[Supplement comparison](sol-source-supplement/results.md)

## Reproduce

Rebuild the v2 primary and expansion subjects using the
[initial recipe](../results-v2.md). Fetch the exact Domus PR base and historical
heads in `prepare.py` into a disposable bare checkout. Download the matching
`playwright-1.64.1.tgz` and `@playwright/test` archive from the npm registry.
The source preparation checks both archives against the immutable lock before
reading dependency source. The same tooling also consumes the audited SDK
source pinned in the manifest.

```sh
python3 prepare.py /tmp/v2-lab /tmp/domus.git /tmp/playwright-1.64.1.tgz /tmp/test-1.64.1.tgz /tmp/v4-subjects /tmp/v4-bindings
for file in subjects.lock.json candidates.json evidence.json; do diff -u "$file" "/tmp/v4-bindings/$file"; done
shasum -a 256 -c frozen.sha256
node --test verification.test.cjs
BUGBOT_PILOT_SDK=/path/to/audited-sdk node --test adapter.test.cjs
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/v4-subjects preflight
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/v4-subjects frozen-replay /private/path/trials.jsonl
BUGBOT_PILOT_SDK=/path/to/audited-sdk node run-pilot.cjs /tmp/v4-subjects full-review /private/path/trials.jsonl
python3 score.py /private/path/trials.jsonl --public /private/path/public.jsonl
```

Run the supplement only after completing the main matrix. Verify its checksums,
then pass the same prepared subjects and private ledger to its `run.cjs`.
Omit the output argument to check the 18 historical prompt hashes without
calling the provider. Supply a new output path for the independent replay.
