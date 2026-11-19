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
failed. `initial-fixture-failure.log` retains that harness failure. The corrected
fixture adds a unique RIGHT line; no production anchor or receipt validation was
weakened. The shipping TypeScript loader also avoids the historical ES2022
progress-clock initialization mismatch, so these controls reach the actual
operation rather than silently ending before detection.

Reproduce with `pnpm run test:bugbot-shadow-verification`. To retain another
synthetic control ledger, set `COPILOT_CANCELLATION_EVIDENCE` to a new absolute
destination when running `node --test` on `normal-flow-shadow/cancellation.test.cjs`.
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
all five tests when run alone (`worker-failure-recheck.log`). Final delivery
evidence must identify a successful complete hook retry separately.
