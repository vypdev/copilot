# Pull request title compatibility

- Status: Implemented — pending PR checks and review
- Date / last verified: 2026-10-20
- Catalog capability ID: `github-communication-experience`
- Owners: Copilot maintainers
- Scope: Preserve contributor conventional PR headers and generate compatible linked-issue titles.
- Related issue: [#621](https://github.com/vypdev/copilot/issues/621)
- Required reviews: product metadata UX, architecture, compatibility, tests, documentation
- Open decisions blocking readiness: none

## 1. Executive summary

The current PR title takes precedence when it has a Conventional Commits header.
When title automation is enabled and generation is necessary, use a conventional
release-type prefix with an optional trailing issue reference. Issue display
decoration MUST NOT precede that release type.

```text
open/reopen -> read current PR title -> conventional? preserve
                                    -> otherwise read linked issue -> generate -> update once
```

Text equivalent: read live metadata, preserve the existing conventional header,
and only generate a title from a distinct linked issue when needed.

## 2. Problem, current behavior and evidence

Observed: `runPullRequestTitleUpdate` reads the linked issue and passes event-time
PR metadata to `IssueTitleRepository`. The repository generates `[#N] emoji -
subject` regardless of the author's title. In #621 this replaced a passing
`chore:` title and caused the consumer's semantic check to fail without a code
change. Historic motivation for unconditional replacement is unknown.

The intentional contract preserves linkage, the title-automation opt-out,
idempotency and normal provider error handling. The old PR decoration format
is the defect being replaced; issue title decoration remains a separate concern.
Primary sources: [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
and the [consumer validator](https://github.com/amannn/action-semantic-pull-request).

## 3. Actors and terminology

Contributors own the PR's semantic intent; maintainers own accepted types/scopes
and their CI policy. A conventional *shape* is a non-empty type, optional
non-empty parenthesized scope, optional `!`, colon, space and single-line subject.
Recognition is not an attestation that the consumer's validator accepts it.
The linked issue supplies fallback subject/kind, not authority over a valid header.

## 4. Goals, limits and fixed invariants

Preserve recognized author text byte-for-byte, including custom/Unicode types,
casing, scopes, breaking marker, punctuation and versions. Use live PR metadata
instead of a stale event before deciding to mutate. Keep unlinked/disabled paths
as no-ops. No CI exemptions, source edits, issue-link changes or merge authority
are introduced. GitHub's update is not compare-and-swap: a concurrent edit after
the live read remains a provider limitation, not a claimed solved race.

## 5. Product journey

| Situation | Result |
|---|---|
| Author has `chore: run backend OWASP audits only on manual dispatch` | Preserve exactly despite a decorated linked issue |
| Author corrects title while an older event waits | Read the correction and preserve it |
| Plain/decorated title needs generation | Generate e.g. `fix: Correct cache key (#42)` |
| Repeat processing | Existing generated conventional title becomes a no-op |
| Read/provider failure | Report failure; do not claim an update |

## 6. Behavior and state ownership

The application validates enabled state and distinct positive linkage before
provider reads. It MUST read the current PR title first and stop if unreadable.
Recognized headers skip linked-issue reads and mutation. Otherwise read the issue
and use its normalized source title and existing subject sanitizer.

An already-conventional source issue title is retained. Other generated titles
use `fix` for hotfix/bugfix/bug, `feat` for feature/enhancement, `docs` for
documentation, and `chore` otherwise, in that precedence. A fixed 256-character
generation budget retains prefix/reference and truncates only the sanitized
ASCII fallback subject. Empty fallback subjects become `Update linked issue`.
No durable ownership marker or operation schema is added.

## 7. Configuration

Existing `emoji-labeled-title` keeps its default `true`. When false, issue and PR
title automation are disabled with no title-provider I/O. When true, issue titles
use their existing display policy; linked PR titles use this compatibility policy.
There is no new format input or legacy-decorated PR alternative. Type recognition
is deliberately broader than a consumer's accepted-type list; that list and
subject checks remain consumer-owned. No secret, URL or script is configurable.

## 8. Architecture

`pull_request_title_policy.ts` is a pure application policy owning recognition,
kind precedence and bounded generation. The title use case owns sequencing and
live-read failure. The bound title port owns repository identity/credentials;
the provider adapter normalizes the issue display subject and applies the selected
title through the existing GitHub client. No provider DTO or concrete adapter
enters the policy/use case. Existing dependency tests remain enforced.

```text
PR lifecycle -> title use case -> pure title policy
                            -> bound metadata port <- GitHub adapter
```

Text equivalent: lifecycle delegates sequencing to the use case, which uses pure
decisions and a bound provider port rather than direct GitHub calls.

## 9. UI/content contract

Pending: existing workflow run identifies PR processing; no new comment.
Complete: native title is `fix: Correct cache key (#42)` and the Job Summary
records the update. No-op: the native author title remains unchanged; no comment.
Blocked: `The current pull request title could not be read. No title change was
attempted.` with `provider.unavailable` in technical evidence. A failed linked
issue read retains the title. Partial: a confirmed native metadata write is not
rolled back merely because later PR work fails; inspect the existing run result.
Semantic type tokens are not localized; author content is preserved and existing
result localization remains authoritative. No new browser/mobile UI is added.

## 10. Failure and recovery

No unverified title is written when current/source reads fail. Provider failures
use existing result/error projection and retries through a normal lifecycle run.
Contributors may correct native metadata directly. The generated workflow keeps
ignoring body/title-only `edited` events to avoid loops; custom workflows that
process them must still preserve the current conventional title.

## 11. Security and privacy

No extra permission is required. Repository/token binding, positive linkage and
provider error redaction remain intact. Titles are strings passed to the provider,
never shell commands. Generated fallback subjects use the existing sanitizer;
recognized author headers are not re-published into a new comment. No logs of
credentials or private configuration are added.

## 12. Observability

Existing native PR metadata and Job Summary are the evidence. Preserve no-op
semantics and zero new notification/comment budget. No telemetry schema changes.

## 13. Compatibility and rollout

Existing decorated PRs are not bulk-migrated. On the next title-processing event,
non-conventional titles may change to the new format; conventional titles remain.
No input/state migration is needed. Other title conventions can use the existing
opt-out. Rollback restores the former package behavior; consumer CI is never
weakened as part of rollout or recovery.

## 14. Numeric test budget

The incremental minimum is **36 distinct automated cases**, outside existing
semantic-publication budgets: 28 pure-policy cases (8 preserved shapes, 8 invalid
shapes, 8 kind mappings, source-header preservation, empty fallback, overlapping
kinds, size bound), 6 application cases (author precedence, stale event, replay,
unreadable PR, current metadata replacing an obsolete event, missing source), and
2 adapter cases (no provider mutation for author header, generation/replay).
Existing disabled/unlinked/provider-error tests and architecture gates remain.
Pure policy coverage SHOULD be 100%; existing repository coverage budgets remain
required. Fixtures use no live private consumer, model or real wait.

## 15. Documentation

Update action input help, general configuration, PR configuration and workflow
setup with precedence, generated types, opt-out, migration and race limits.
Existing routes suffice; documentation validation MUST check their anchors.

## 16. Acceptance

1. Processing the reported author title with a decorated #192 performs no title write.
2. A plain PR for a bug issue gets `fix: subject (#N)` and keeps native/body linkage.
3. Reprocessing the result makes no further write; a contributor correction is preserved.
4. A stale event cannot override an already-visible conventional correction.
5. Unreadable metadata blocks the write; disabled/unlinked routes stay no-ops.
6. Fixed generation bounds and type precedence pass; no validator policy is relaxed.

## 17. Traceability

Recognition/generation -> pure policy suite; live precedence/failure ->
`pull_request_title_compatibility.test.ts`; provider no-op/replay -> title repository
suite; disabled/unlinked/provider failure -> existing title use-case suite;
documentation -> PR workflow/configuration and validators.

## 18. Implementation order

Pure policy and fixtures; application live-read sequence; adapter integration;
documentation/catalog; full checks and compiled shipped bundles.

## 19. Definition of Done

All 36 incremental cases and existing relevant tests, type/lint/architecture,
coverage, specification/documentation/workflow validators and generated bundles
pass. Graphify is current. The linked PR describes the compatibility migration
and the residual non-atomic provider window. No merge or release is implied.

## 20. Decisions and references

Preserving only the event title was rejected because it can be stale. Weakening
the consumer semantic gate or imposing its exact accepted types was rejected.
Legacy decorated PR generation is replaced under the existing opt-in/default
toggle; a new matrix of format inputs is unnecessary for this bounded fix.
Issue #621 carries the sanitized incident and verified metadata-only workaround.
