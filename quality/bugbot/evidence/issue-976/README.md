# Accepted dispatch acknowledgment — #976

The five focused dispatch, worker, handoff, publication-workflow and policy
suites pass **62 tests** with fake providers. The dispatch matrix includes the
direct ID, unique accepted 204, absent/ambiguous match, foreign workflow/ref/
repository/operation, denied lookup permission, transient workflow/origin/list
reads, acknowledgment replay, a foreign direct ID, later/incomplete pages,
lost POST response, concurrent retries, replaced origin and progress sequences.
The actual worker rejects a missing/forged correlation before provider reads.

The caller hashes the actual encoded handoff. Progress includes its native
observation sequence in the correlation so subsequent progress still wakes the
writer. A replay shares the accepted operation rather than blindly sending
another POST. The worker independently recomputes the hash before applying its
existing source, actor, head, policy, attempt and serialized-publication checks.
Run/data correlation is not independent attestation of executable producer code.

The first three control attempts could not compile: two TypeScript inference
errors, followed by a stale numeric run-ID use after introducing a typed effect.
They executed zero tests. Their logs are preserved. Subsequent controls passed
17, 47, 59 and 60 tests as receipt binding, worker validation and progress cases
were completed; `final-controls.log.gz` records all 62. These are implementation
controls, not model qualification campaigns or live installation evidence.

Run the five Jest files named in the final log. Source workflow validation,
typecheck, lint, generated-bundle and specification/docs checks accompany the
PR's delivery SHA. The owning SDD and catalog register this adapter and its
fixed acknowledgment bounds. There is no model investigation deadline or
new user configuration. Consumer installation templates are unchanged.

No model or real GitHub call occurs in these controls. A completed handoff
receipt is unavailable on failure; existing publication controls preserve the
last verified card and Check fallback. Production verification stays disabled.
The corresponding workflow still needs explicit reviewed installation on the
trusted default branch under #977. A develop PR cannot establish installation.

## Exact-parent reconciliation, 2026-11-20

The [official synchronization](https://github.com/vypdev/copilot/actions/runs/44792755868)
against `0ddac1011204db6dda45dff0f99e3ef91309c701` passed its source and extension
tests but aborted at the final workspace guard (`unexpected-paths`, one added
generated bundle). It pushed no synchronization commit. The original branch
and parent remained unchanged. Rebuilding the original contribution changed no
bundle; that proposed explanation was disproved.

The [recorded exact-parent recovery plan](./exact-parent-reconciliation-plan.json)
uses the maintainer-delegated merge authority after that actual Action error.
It preserves the Action-created ref and original contribution, without remote
branch creation, replacement, force, deletion or protection changes. All parent
contracts and both SDD appendices remain present, and the source/workflow patch
ID is unchanged (`5258c02e3c9035e7781c00129f01af81f5ef7ea8`).

The [prepared-merge validation](./exact-parent-validation.json) passes the five
owning suites and 62 assertions, build, specification generation/validation,
documentation and agent-doc contracts; Graphify was updated with AST analysis.
These facts describe the prepared merge. The ordinary commit hook and final
native checks must be inspected separately. The failed native log and exact
lossless log digests are retained; no installation or canary is claimed.
