# Normal-flow operation cancellation — #972

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
