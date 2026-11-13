# Final verdict with matched #892 evidence

This diagnostic isolates verdict handling on the known #892 candidate.
The comparison runs on the two seeded candidates and the four Git
fragments per tree from the [matched-source control at be36415c2](../detector-verifier-diagnostic/results.md).
The [historical ledger](../detector-verifier-diagnostic/trials.jsonl) and
its [checksums](../detector-verifier-diagnostic/frozen.sha256) are preserved.

| Tree | Head | Git tree | Seeded candidate |
| --- | --- | --- | --- |
| N1 | `55174696e97a4c8b424c7f57d7da7a61e4b157fd` | `0d5efca673329a8a28d1b9e93a46b564edcbe285` | `c-892-5aeaf4db18c0ba79` |
| N2 | `c654e501593ddb01446c6b37873a5b094624dd93` | `263e61f6c8d518657a3e160774f0af8f1f3f49d9` | `c-892-02a446bb39060f51` |

Both candidates retain right-side line 107 of
`packages/core/src/components/navigation-overflow.ts`. Their common
hypothesis concerns selection after a fresh pointer click following an
outside drag release. The runner keeps the scoped diff as context and
offers only the four pinned Git receipts for citation. The
[subject lock](../reserved-navigation-diagnostic/subjects.lock.json)
fixes the checkout and scoped comparison. The
[Chromium observations](../reserved-navigation-diagnostic/browser-control.jsonl)
and [oracle](../detector-verifier-diagnostic/oracle.json) stay in the
evaluator.

## Historical contract rejections

| Model | N1 trial | N2 trial | Recorded check | Diagnosis |
| --- | --- | --- | --- | --- |
| GPT-6 Luna | `86e4e564938b3003` | `de8ef069ff206a2e` | `citation-integrity` | Combined duplicate and membership check. Exact cause indeterminate. |
| GPT-6.1 Sol | `f4a1dbb49e7c10a0` | `0272ec3130f36b4d` | `invalid-verifier-response` | Combined shape and candidate identity check. Exact cause indeterminate. |

All four historical trials reached the provider with all three material
links covered by delivered source. The [old validator](../detector-verifier-diagnostic/runner.cjs)
groups the checks above and the rejected payloads were discarded. No
subcause can be assigned retrospectively.

## Final-only contract and preflight

The provider receives a dedicated schema with verdict, citations,
three link states, reason and missing premise. There are no read
requests or model-owned identity fields. The application binds the
validated response to the frozen candidate, revision, Git tree,
operation and anchor. It limits the citation enum to the four supplied
aliases, resolves them to the original receipt IDs, and checks
uniqueness, membership, candidate, revision, operation and source
integrity. It records individual rejection codes and the failing field,
without persisting rejected payloads.

The [runner control](runner-control.json) attests that both profiles
get byte-identical prompts and identical schemas and receipt IDs for
each tree. It checks the IDs against the historical ledger. The runner
accepts simulated confirmations, refutations and inconclusives. It
rejects a legacy read field, a malformed link state, a missing
inconclusive premise, duplicate
and foreign citations, wrong prompt identity, a shifted anchor,
wrong-revision and wrong-candidate receipts, an operation mismatch and
altered source. A write trap fails before provider dispatch.

## Execution

The [manifest](manifest.json) fixes 12 slots in tree order N1 then N2,
with three repetitions each. Each repetition starts Luna then Sol as a
concurrent pair and finishes both before the next pair. Both models use
low effort, the same pinned transport and a new closed session for
one call. There are zero retries and zero read rounds. GitHub publication
ports fail if invoked. The runner makes no detector calls.

The limits per slot are 90 seconds total, a 42-second provider deadline,
32,768 gross input tokens including cached input, 4,096 output tokens,
15,500 packet bytes and 21,500 prompt bytes. The runner journals each
start and finish and records a result including failures, expirations,
latency, usage and write attempts. The evaluator retains aborted slots
and treats unavailable metering as an unproven budget.

## Scoring

Score contract validity independently from correctness. For each
conclusive answer, use the evaluator's fixed ranges to check delivered
and cited coverage of the post-drag suppression state, the fresh click,
and the dispatch decision in `tabs.ts`. A state marked unknown or a
material link without a citation prevents a conclusive result from
counting. A supported refutation must identify the concrete
counterevidence in the new-click path and the resulting selection.
Check the recorded reasons against the source before counting a trial
that passes the structured checks. A reason that contradicts those
checks counts as a judgment error and is recorded in the report.
A valid inconclusive answer names a specific missing premise. Report
those separately from contract rejections, unsupported conclusive
answers, wrong verdicts or causal states, and operational failures.

A correct trial requires the expected verdict and link states, all
three material links delivered and cited, the original anchor, proven
budget and zero write attempts. Assess each profile separately. It
passes only with three correct refutations of N1 and three correct
confirmations of N2. Passing this known-case control leaves automated
recovery and detector handoff for separate trials.

## Reproduction

Use the isolated fixture preparation in the
[reserved navigation protocol](../reserved-navigation-diagnostic/preregistration.md).
From this directory, run the frozen checks and model-free controls.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs /absolute/path/to/subjects
```

From a clean checkout of the preregistration commit, set
`BUGBOT_PILOT_SDK` to the pinned SDK directory. Use the manifest's
Codex CLI version through `BUGBOT_PILOT_CODEX` or PATH. Supply a new
output directory and the full preregistration commit SHA. This command
consumes 12 provider calls.

```sh
node run.cjs /absolute/path/to/subjects /absolute/path/to/new-output "$freeze"
python3 score.py /absolute/path/to/new-output/trials.jsonl
```
