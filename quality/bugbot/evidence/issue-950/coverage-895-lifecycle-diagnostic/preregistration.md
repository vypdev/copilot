# #895 lifecycle evidence control preregistration

This is a six-call Sol replay of the [complete-evidence phase at
`737e93886`](../coverage-895-complete-diagnostic/results.md). It uses the
same original `fc143a7fce3e6d50647804f29b0ed0af27fa0e32`, mutant
`06145cbe19f52fa5b9c61fecd381bcbe36421241`, candidate, operation, and
right-side line 14 of `tooling/coverage.mjs`. The historical records and
their original scoring remain frozen.

## Evidence and preflight

The prepared packets retain the project configuration, runtime extension
list, test command and source for the independent inventory comparison.
They retain the relevant Storybook collection, Vitest exclusion, V8 filter,
remap, merge and reporting, and JSON-summary writer source. The additions
show the order from project configuration resolution and attachment,
through awaited `configureVitest` hooks, through initialization of the
V8 provider and its use of the resulting coverage options. The
[ranges](ranges.json) distinguish retained, audited and extra excerpts
from the same authenticated files.

The fixture validates the locked package snapshots, tarball integrity,
installed bytes and member provenance. Preparation verifies the audit
excerpt hashes and issues receipts for the exact requested ranges.
Each receipt binds package, version, integrity, file digest, range,
lockfile, candidate, operation, head and tree. A file table removes
repeated locators. Receipt aliases refer to full validated receipts
recorded in the ledger. The model packet contains source only. Generated
reports, execution outputs, and the expected verdicts stay with the
evaluator. Neither arm of runner-directed retrieval is part of this replay.

The [simulated controls](runner-control.json) record the complete serialized
packet and prompt byte counts, their hashes, the exact schema hash,
alias map and receipts. The actual runner validates positive and negative
citation and provenance cases, including the write trap. The
[coverage checks](coverage-controls.json) show that the historical
packets still cover their original groups and fail the new lifecycle
requirements. Both compact packets must cover every required group
before a provider call.

## Schedule and scoring

The [slots](slots.json) fix three original and three mutant trials,
alternating trees by repetition. Use GPT-6.1 Sol at low effort,
with the [pinned SDK and CLI](manifest.json). Each trial starts a
fresh closed session and makes one call with no retry. The per-call
limit is 42 seconds. Trial ceilings remain 90 seconds, 32,768 gross
input tokens and 4,096 output tokens. Packet and prompt ceilings
remain 15,500 and 21,500 UTF-8 bytes. The serialized dependency part
retains the 9,000-byte bound, and each exact fragment remains within
80 lines and 4,400 bytes. Unknown usage fails qualification. Preserve
every attempt and require zero GitHub writes.

Require all three original trials to be supported refutations and
all three mutant trials to be supported confirmations. Check the
six historical groups and their retained material ranges. The new
requirements cover configuration resolution before the hook,
completion of the hook before V8 initialization, and the provider's
use of the resulting options. Independently audit whether the
reason connects that sequence to the actual exclusion, the presence
or absence of the CSF summary entry, and the effect on inventory.
A correct label with a wrong or unsupported causal explanation fails.
Distinguish a valid inconclusive, an unsupported conclusion, an
incorrect judgment, and technical or budget failure. Anchor and
receipt identities must hold in every qualifying trial.

A pass meets only the entry criterion for a separate runner-directed
search iteration. The PR stays in draft and production activation
remains disabled.

## Reproduction

Prepare the [pinned fixtures and dependency archives](../coverage-895-reserved/results.md#reproduce).
Use Node 24.20.0, Python 3.10 or later, and the pinned SDK and CLI.
Run from this directory. The measured command requires the exact
clean freeze.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs "$LAB" "$LAB/archives" --check
python3 score.py --check-controls
BUGBOT_PILOT_SDK="$PINNED_SDK" node run.cjs "$LAB" "$LAB/archives" --run "$OUT" "$FREEZE"
python3 score.py "$OUT/trials.jsonl" causal-review.json
```
