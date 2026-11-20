# EV-07 corpus revision 2 — #985

This new 174-case data revision changes only the workflow input of
`actions-readonly-metadata`. The original v1 bytes, labels, plans, predictions
and failed scores remain unchanged; their exact baseline hashes are retained.
The JSON schema remains version 1. The v2 filename identifies a data revision.

The original root `steps` with no `jobs` is malformed as a complete workflow.
Revision 2 supplies one complete job running only the numeric PR metadata echo,
with explicit read-only contents permission and no checkout or PR execution.
The fixture's `ubuntu-latest` is fictional consumer context, not a source-repo
workflow or a runner-policy change. `expected: []` is proposed for independent
review of this corrected input; it does not relabel the original campaign.

`derivation.json` contains the exact before/after input and both corpus hashes.
Six deterministic controls cover original malformed shape, corrected complete
workflow, the fixed authorized metadata command, invalid structural negative,
all 174 stable IDs plus 173 unchanged case objects, and unchanged historical
hashes with deterministic derivation. The public benchmark loader accepts v2.
The fixed shell control prints a synthetic numeric PR value and makes no network,
GitHub or model call. No arbitrary corpus command is executed.

The original v1 remains the existing CLI/driver default. Before #974, the new
campaign must explicitly select this reviewed v2 artifact in a newly committed
exact driver/preregistration, after all deterministic prerequisites and this
correction merge. The current hardcoded v1 driver is not silently repurposed.
No v2 score or qualification result exists here. All previous negative results
remain negative. Precision/recall/F1/location/severity/category/Brier thresholds
are unchanged; no production prompt is tuned from this case.

Run `node --test quality/bugbot/evidence/issue-985/corpus-revision.test.cjs` or the
existing shadow-verification script. Production stays disabled and all 42
paired full reviews remain unstarted pending a genuinely passing identical-pin
corpus. No installation, activation, release or policy change is performed.

Evidence: #971 / PR #984; the independent structural rule is GitHub's official
[job steps syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps).

## Integration after #970

Official synchronization run44715042422 resolved the sole package.json conflict,
then passed943 Jest suites/18,695 tests with35 pre-existing skips. Its extension
run passed384 files and5,281 tests, but the unchanged Safari resource suite's
beforeAll build exceeded the existing60,000ms hook timeout; its10 cases were not
executed. The Action aborted without commit or push and verified restoration of
originalddc768b2. The complete native failure is retained losslessly in
official-sync-verification-failure.log.gz, with raw hash/length in
integration-log-manifest.json.

The extension Git tree is identical on originalddc and parentdevelop4736cd4
(4a5bbf2f98bec1b429c9821fb8a0eca3e3e66a21). The unchanged isolated Safari resource
suite passes10/10 locally in9.86s without changing source, timeout, concurrency
or runner configuration. This is an existing deterministic native-command
fixture, not actual Safari acceptance or a substitute for #981/#982. It does
not establish a whole native Linux pass or prove the earlier timeout's cause.

Under the maintainer's delegated merge judgment, exceptional recovery is prepared
on the same existing985 ref and exact parent4736, with its recorded
sync-reconciliation-plan.json. The package test command preserves both the new
bootstrap controls and the original v2 corpus controls. All v1/v2 bytes, IDs,
labels, original frozen artifacts and derivation hashes are preserved. Ordinary
full verification, committed-source shadow controls, a normal same-ref push with
fresh identity checks and final-head native checks remain required. No unchanged
Action retry, force, ref creation/rename/deletion, installation or activation is
part of this recovery.


## Integration after the #971 audit

After #971 merged into develop `c6590bd8e03aced19250d681788f53268dede600`,
official synchronization [44739846048](https://github.com/vypdev/copilot/actions/runs/44739846048/job/136300431878)
merged cleanly without a conflict or fixer. Build and typecheck passed. Native
coverage then stopped: 942 Jest suites / 18,688 tests passed and 35 old skips
remained; the first unchanged operator Actions test exceeded its existing
30-second timeout and six later cases encountered the unfinished same-process
inspection guard. Extension tests and downstream coverage-budget checks did not
run. The Action aborted and verified restoration of the exact prior head
`8ce0a5d3146a9fb8d38c73303a7a7abec05fef20`, with no commit or push attempted.
Error reference: `0e6a85a1-7e38-4e9f-b3c4-24cb2e7ccd00`.

The complete negative log is retained in
`c659-official-sync-verification-failure.log.gz`. The test, adapter, journal and
HTTP implementation have identical Git blobs on the old child, c659 parent and
successful #973 synchronization. All eight operator Actions cases passed unchanged
in a separate local run (2.667 seconds). Its log and identity receipt are retained
in `c659-operator-actions-isolated.log.gz` and the adjacent JSON. This diagnostic
does not establish the native timing cause, a full native coverage pass, or actual
Setup platform observations.

The recorded `c659-sync-reconciliation-plan.json` is a new recovery plan tied to
this actual error and exact child/parent, under the maintainer's standing merge
delegation. It does not reuse the old 4736 failure as authority for a new base.
The same existing ref is reconciled with c659; no executable source, assertion,
timeout, workflow, runner placement or concurrency setting is changed from the
clean merge. Original v1, reviewed v2, derivation, IDs, labels, order and frozen
#950 artifacts remain byte-identical to the prior child. Ordinary full delivery
verification, committed-source controls and all final-head native gates/findings
remain required before a normal authorized PR merge. No unchanged Action retry,
force or remote branch creation/rename/deletion is part of this recovery.
