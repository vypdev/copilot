# Normal-flow operation cancellation — #972

The earlier 204-case replays below retain their actual outcomes. Their original
post-provider interruption case canceled before provider settlement, so its
passing terminal state did not establish that distinct ordering boundary. See
[the corrected control](#post-provider-ordering-control) and its retained
counterfactual. Final committed-source and native verification remain required.

The actual normal-flow runner now passes its existing signal through
`projectBugbotReviewOperationContext`. An explicitly interrupted provider remains
an interrupted operation, rather than a successful ordinary dry-run containing
only a technical verifier failure. The terminal ledger distinguishes
`interrupted`, `completed` and `failed`; interrupted CLI execution exits 130.

Seven deterministic controls pass with zero model calls and zero GitHub write
attempts. Six exercise the actual runner, real operation, preparation and
application cancellation boundaries with pinned Git fixtures: before detection,
during detection, between preparation and verification, during verification,
after a technical provider interruption, and uninterrupted completion. The seventh
proves that canceling the experimental arm cannot start its inherited comparison.
`controlled-attempts.json` retains the actual pending request metadata, stage
observations, results, unchanged-workspace checks and empty write inventories.

Removing only the operation-signal field reproduces the original defect in the
controlled verifier-interruption case. `without-operation-signal.json` records
the canceled provider while the ordinary application result incorrectly succeeds;
the regression test fails on that success. Its log is retained separately. Other
cases excluded by that negative control's test-name filter are not claimed as
executed acceptance; all seven ran in the passing full control suite.

The initial fixture used a replacement at the same LEFT/RIGHT line, which
correctly made its candidate anchor ambiguous. No verifier ran and three tests
failed. `initial-fixture-failure.log.gz` retains that harness failure. The corrected
fixture adds a unique RIGHT line; no production anchor or receipt validation was
weakened. The shipping TypeScript loader also avoids the historical ES2022
progress-clock initialization mismatch, so these controls reach the actual
operation rather than silently ending before detection.

Reproduce with `pnpm run test:bugbot-shadow-verification`. To retain another
synthetic control ledger, set `COPILOT_CANCELLATION_EVIDENCE` to a new absolute
destination when running `node --test` on `quality/bugbot/evidence/issue-950/normal-flow-shadow/cancellation.test.cjs`.
That test-only destination is not a public Action setting or a measured pilot.

Historical campaigns and ledgers remain unchanged. A current replay needs a new
driver pin and applicable source/runtime admission. This correction introduces
no deadline, token budget, read quota or turn limit. Production verification
remains disabled; no profile is qualified or new corpus/full-review campaign run.

The first implementation commit passed all 943 Jest suites. A later commit to
retain ignored log files encountered a Jest worker SIGSEGV in the unchanged
`setup_batch_composition.test.ts` before that suite could execute; 942 suites
passed. `commit-hook-worker-failure.log.gz` preserves that unsuccessful hook.
It is not an assertion result or model measurement. The affected suite passed
all five tests when run alone (`worker-failure-recheck.log.gz`). Final delivery
evidence must identify a successful complete hook retry separately.

Raw control logs are stored losslessly as gzip because their original reporter
whitespace fails the source diff gate. The compressed-logs.json manifest binds
each exact decompressed SHA-256 and length. Original committed attempts remain
in Git history; no log line or negative outcome has been rewritten.

## Integration with the authenticated #970 bootstrap

The original seven-case evidence above remains historical. The integrated
controls now commit an owned disposable source snapshot and a second plan commit,
then invoke the reviewed external bootstrap. Their controlled-provider wrapper
is appended to the unchanged actual runner and included in the authenticated
driver digest; no production entrypoint, admission bypass or test mode is added.
The relative-lab control shares this fixture so precommit package changes also
have a truthful source pin.

The integrated inventory contains eight cases: the five original interruption
boundaries, ordinary completion, non-cancellation provider failure, and canceled
experimental/inherited sequencing. The actual bootstrap process must exit 130,
0 or 1 for interrupted, completed or failed ordinary review respectively.
The provider-failure control causally reproduced an integrated failed ledger
exiting 0 before the bootstrap exit mapping was corrected. The initial six
uncommitted-manifest failures and this negative result are retained separately;
neither is a passing acceptance result.

The official Action synchronization of exact develop4736cd4 into managed
972/e1b7d2d failed at its existing 900,000ms fixer timeout and aborted without a
push. Its run44714013610, correlated response and raw log are retained. After the
maintainer delegated merge judgment, exceptional recovery was prepared on that
same existing ref and exact parent, preserving all three conflict paths and both
source-admission/cancellation contracts. Only a normal same-ref push may publish
that verified recovery, after rechecking both remote identities. No new branch,
force-push, installation or production change is part of this recovery.

The first authenticated complete focus run passed the original seven cases.
The additional failure case already returned exit 1, but its test incorrectly
expected one detector request; the ordinary detector performed its existing three
retries. `authenticated-initial-focus.log.gz` and
`authenticated-initial-controlled-attempts.json` retain that 7/8 result, full
committed pins and requests. The corrected assertion requires an observed
provider failure and zero verifiers without imposing a retry count. No retry
policy, model deadline or qualification threshold was changed.

All eight terminal-state controls pass in the combined suite, including exit 1
and the unchanged ordinary retry behavior. The first whole-suite attempt records
187/204 passing cases; the other 17 root-bound corpus-fixture cases correctly
reject the staged package.json against the old real HEAD. The admission check is
retained. `combined-uncommitted-source-shadow.log.gz` and
`combined-uncommitted-source-controls.json` preserve that complete attempt,
including all five interrupted exits130, one completed exit0 and one failed exit1
with empty write inventories. The complete suite must be rerun against the
committed candidate before any push; this precommit attempt is not a full pass.

The first committed-source replay on c00f0aec passes203/204, including all17
previously rejected root-bound cases and all eight terminal-state controls.
Its only failure is fixture construction for the relative-lab case: when source
and drivers already equal the cloned HEAD, a new snapshot commit has nothing to
commit. The helper now reuses that existing committed source pin and creates a
snapshot commit only when staged bytes differ. The separate plan commit and
complete public bootstrap admission remain mandatory. The exact203/204 log and
operation ledgers are retained as committed-c00f-shadow-203-of-204.log.gz and
committed-c00f-controls.json; this result is not reported as a full pass.

The corrected relative-lab control passes1/1 in60.24s through the real bootstrap,
with zero candidates, verifiers, model calls and writes. Its exact log and the
bounded fixture-only change are retained in clean-fixture-relative-focus.log.gz
and clean-fixture-correction.json. A new ordinary delivery commit and complete
204-case committed-source replay remain required before publication.

## Committed integrated result and budget clarification

The complete publication sequence above finished on
`a8b3d1654e5d8cc8dedb14de48792a78fdde2237`: the ordinary build, lint and all 943 suites / 18,695 tests
pass, followed by **204/204 committed-source shadow controls**,
zero failed, canceled or skipped, in 390.518s. All eight terminal-state controls,
committed pins and empty write inventories pass. The normal same-existing-ref
push and authenticated remote/PR readback completed at 11:34:15Z. The complete
positive log and actual controlled-operation rows are retained losslessly in
committed-a8b3-shadow-204.log.gz and committed-a8b3-controls.json; the manifest
and actual receipt are in committed-a8b3-validation.json. Older negative outcomes
remain unchanged.

Native Review on a8b3 identified a LOW ambiguity between the historical #970
196-control total and this amendment's eight additions. The specification now
explicitly scopes 196 to that historical revision and 204 to this amendment's
reviewed base; other independently integrated controls remain additive. This
clarifies the budget without changing executable code, drivers, tests, thresholds
or runtime. A new documentation/evidence commit still requires its ordinary hook
and fresh final-head native checks before merge. No native Review success or
profile qualification is claimed for that not-yet-published head.

The adf733bc native progress check correctly rejected the newly added compressed
JSON ledger as required binary content: .json.gz is outside the unchanged
workflow evidence exclusions. The current ledger is therefore published as
ordinary UTF-8 JSON with the exact decompressed bytes and hash from the actual
a8b3 run. The compressed original remains in commit adf733bc and its compressed
hash and historical path are retained in committed-a8b3-validation.json. The
existing .log.gz archives, all negative outcomes and the progress/binary guards
are unchanged. This is an evidence-format correction, with no executable,
configuration, threshold or result change; it requires a new ordinary commit and
fresh native checks, not an unchanged retry of the rejected binary.


## Post-provider ordering control

Official Action synchronization
[44740742936](https://github.com/vypdev/copilot/actions/runs/44740742936/job/136303469909)
cleanly merged develop `c6590bd8e03aced19250d681788f53268dede600` and published
`2a30e17530bd517da33446449572609bd8c1678b` (parents 64cd + c659). Native build,
typecheck, lint, specifications and documentation passed, together with
943 Jest suites / 18,695 tests (35 existing skips) and
385 extension files / 5,291 tests. The full log is retained losslessly.

Review on 64cd found that the case named `after-provider-interruption` aborted
inside the verifier before returning `provider-turn-failed`. That case proved an
interrupted terminal state but not the required post-interruption ordering.
The new ordering assertion rejects that old fixture: its provider-result
observation already sees an aborted signal. The targeted negative log and full
controlled-operation rows are retained without relabeling this attempt a pass.

The corrected fixture returns the provider failure first. The actual runner's
optional internal verifier-result observation then sees a settled
`technical-failure` / `provider-turn-failed` with an active signal, aborts the
controller, and records the aborted signal. The ordinary operation is still
required to report interruption, blocked publication, empty writes and child
exit 130. The focused corrected control passes with that exact event order.
The during-verification case continues to abort inside the verifier, so the two
boundaries are distinct. The observer adds no CLI option, model deadline or
provider retry; normal runs without an observer retain the existing path.

`post-provider-order-validation.json` binds the full native sync log, negative
ordering log, corrected focused log and readable control ledgers. Original v1,
all frozen campaign data and prior failed/passing attempts remain unchanged.
The inventory remains eight cancellation cases / 204 controls at this reviewed
base. The corrected final commit still needs its ordinary complete hook,
committed-source replay and fresh native groups/Review before integration.

The separate 64cd native CI failure is also retained: two synthetic credential
transport cases reached their existing 5-second shell timeout. The unchanged
full suite passes 82/82 locally in 8.324 seconds, using fake curl and no real
credentials or health dispatch. This diagnostic establishes neither the native
timing cause nor a whole native pass. Source, assertion, timeout, workflow,
runner and concurrency settings for that suite remain unchanged.
