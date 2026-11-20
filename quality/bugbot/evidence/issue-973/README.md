# Deletion-only citation metadata — #973

The broker now excludes empty new-side intervals before testing changed-line
overlap. For `@@ -3 +2,0 @@`, the prior inverted interval `[2,1]` could label a
head citation spanning lines 1–2 as changed even though neither line was added.
The source/tree/blob, candidate, receipt and range validations are unchanged.
No finding anchor moves.

Six controls use actual immutable Git objects and the real broker:

| Case | Required observation |
|---|---|
| Deletion-only hunk | The adjacent unchanged head range is not changed. |
| Multiple deletion hunks | A spanning range does not acquire a false addition. |
| Real addition | The added line remains changed. |
| Mixed replacement | The new replacement line remains changed. |
| Unchanged boundary and separate addition | The boundary range remains unchanged. |
| Legitimate LEFT deletion | The original base SHA/blob/range and frozen LEFT anchor remain valid. |

Every case also rejects a different candidate's receipt and an out-of-range
citation. The existing full shadow suite retains undelivered-receipt and tree/
revision integrity controls. `before-fix.log.gz` records three failing metadata
cases against the original broker; the addition, replacement and LEFT controls
already passed. `initial-missing-dependency.log.gz` preserves the earlier harness
attempt that could not start before dependencies were installed; it proves no
behavioral result.

Run `pnpm run test:bugbot-shadow-verification`. These controls make zero model
calls and zero GitHub write attempts. Old pilot artifacts, oracle labels and
scores remain unchanged. No new profile is qualified and production verification
remains disabled. Runtime bundles and final-head checks are delivery evidence,
separate from model qualification.

Raw control logs are stored losslessly as gzip because their original reporter
whitespace fails the source diff gate. The compressed-logs.json manifest binds
each exact decompressed SHA-256 and length. Original committed attempts remain
in Git history; no log line or negative outcome has been rewritten.

The first compression commit hook stopped when a Jest worker received SIGSEGV before the unchanged autofix suite could start (942 other suites passed). `compression-hook-worker-failure.json` and its byte-exact gzip retain that unsuccessful attempt; a focused suite check and a complete hook retry follow.
The unchanged autofix suite passes independently: 32/32 tests in one process (`compression-hook-worker-recheck.log.gz`).

## Integration with #970

The official Action synchronization run44715040973 succeeded and published
`a2344c44cc74ca8e133417d817627688b04a6e3f`, with exact parentsdfe3e4aaa
anddevelop4736cd4. The local checkout was only fast-forwarded to that Action-owned
result. Its actual native log passes943 Jest suites/18,695 tests (35 old skips)
and385 extension files/5,291 tests. The complete log is retained losslessly in
action-sync-44715040973.log.gz.

The new Ubuntu static job136245653499 in run44723696726 passes all202 shadow
controls, with no failure, skip or cancellation, plus specification/catalog and
documentation validation. Its decoded log is retained as
a234-native-static-202.log.gz; compressed-logs.json binds both raw byte lengths
and SHA-256 values. action-sync-a234-receipt.json binds these results to the exact
source revision and parents. The six citation controls and all earlier failed
attempts above remain unchanged.

The bot-authored synchronization push skipped the ordinary Commit pipeline.
A normal contributor evidence commit therefore still needs fresh Commit,
Verification, Review, Branch Sync and all required CI groups on its own final
head before integration. These deterministic/native delivery results are not a
qualification campaign or independent host attestation; no evaluated-pilot PR
write or production activation occurred.


## Integration with the EV-07 audit in #971

After #971 merged into `develop`, official Action synchronization
[44739840949](https://github.com/vypdev/copilot/actions/runs/44739840949)
merged that exact parent, `c6590bd8e03aced19250d681788f53268dede600`, without
conflict or fixer changes. The Action published
`7901f915644c7a295426fa4d5c5bef6899032f5c`. Build, typecheck, coverage budgets,
lint, specification and documentation checks passed. The native test run passed
943 Jest suites / 18,695 tests, retained 35 existing skips, and passed all
385 extension files / 5,291 tests. `action-sync-7901-receipt.json` binds the
revision and parents; `action-sync-44739840949.log.gz` retains the full log.

The prior native coverage failure on `3b29fc14851596c2a610c8d909103b24aeaa71c7`
is retained in `3b29-native-coverage-failure.log.gz` and its diagnostic JSON.
Three unchanged build hooks timed out and a History Center readiness assertion
failed. The four affected suites passed 25/25 tests in a separate unchanged
local diagnostic (`3b29-four-suites-isolated.log.gz`). That diagnostic did not
establish the native timing cause or replace a full native pass. The successful
new-parent synchronization above is a separate executed result; no source,
assertion, timeout, runner placement or concurrency rule was changed to obtain it.

The new synchronization push again skipped `Copilot - Commit` because the Action
published it as the bot. The accompanying contributor evidence update therefore
requires fresh Commit, Verification, Review, Branch Sync and CI on its final SHA.
Historical 202-control static evidence remains scoped to its earlier revision;
no new qualification campaign, model-profile decision or real Setup observation
is claimed here. Production verification remains disabled and evaluated-pilot
PR write attempts remain zero.
