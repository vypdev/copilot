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
