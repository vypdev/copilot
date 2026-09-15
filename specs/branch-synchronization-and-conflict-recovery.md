# Branch Synchronization and Conflict Recovery

- Status: Implemented
- Date: 2026-09-11
- Last verified: 2026-09-15
- Owners: Copilot maintainers
- Scope: all-branch drift observation and authorized parent-to-working-branch synchronization
- Related issues/PRs: [PR #387](https://github.com/vypdev/copilot/pull/387), managed issue lifecycle, semantic GitHub publication, and agent runtime SDDs
- Required review gates: product UX, architecture, testing, documentation, security/operations
- Open decisions blocking readiness: none

## 1. Executive summary

A lightweight all-branch observer finds open parent→working-branch relationships,
compares them, and maintains one issue status card when a branch falls behind.
The card itself is the only initial notification. When a previously aligned
card becomes stale again, one short, source-fingerprinted action notification
links back to current status; equivalent retries remain silent.
Authorized users can dry-run or merge the parent into the working branch. Clean
merges need no agent; eligible conflicts may use the fixer inside a strict path,
Git-state, verification, credential, and remote-head boundary.

```text
push any branch -> resolve dependencies -> compare -> upsert/resolve one card
                                             -> aligned-to-stale only: notify once
authorized sync -> fetch heads -> prepare merge -> clean OR guarded fixer
                -> verify -> recheck heads -> trusted commit/push -> observer resolves card
```

## 2. Problem, current behavior, and evidence

### 2.1 Problem

Feature chains and long-running branches drift as parents advance. Running the
full issue/agent pipeline on main/develop/release pushes is expensive and noisy,
while blind automated merges can overwrite concurrent work or expose credentials.

### 2.2 Current behavior

1. `copilot_branch_sync.yml` observes every non-deletion push with no agent inputs.
2. It reads open issues/PRs with pagination and resolves dependencies first from
   durable Copilot configuration, then linked branches and PR base/head facts.
3. It compares affected relationships and upserts one bot-owned status card;
   alignment resolves the same card. The initial stale state creates no second
   comment, while a later aligned-to-stale transition creates one immutable,
   linked action notification per trusted source head.
4. `/copilot sync-branch` or a bounded mentioned phrase invokes authorization
   and resolves the conversation target.
5. `--dry-run`, `--no-agent`, and `--from` alter only documented bounded behavior.
6. Workspace preparation fetches exact remote heads and performs a no-ff merge.
7. Conflicts are eligible for fixer only at ≤20 non-sensitive conflicted paths.
8. Verification, merge-state validation, and remote-head recheck precede trusted commit/push.

### 2.3 Evidence and contract classification

- Observed behavior: branch-sync domain, policies, use cases, repositories,
  workspace/time adapters, workflow, and docs.
- Intentional contract: separate observer, durable-first discovery, sticky
  status card, transition-only notification, clean-merge fast path, conflict
  boundary, and race-safe push.
- Known debt and limitations: observation scales with open issue/PR pagination;
  relationships without durable configuration need an open PR; no live large-repo
  performance evidence is checked in.
- Unknown rationale: the original polling/GraphQL query shape is not a permanent API contract.
- Proposed improvements: indexed durable dependency storage needs a separate migration design.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Entry point | Surface |
|---|---|---|---|
| Contributor | know branch is stale | parent/child push | issue notice |
| Maintainer | align safely | comment command | result comment/commit |
| Observer workflow | compare only | all-branch push | sticky notice |
| Fixer agent | resolve eligible conflicts | guarded merge workspace | conflict paths only |

“Parent” is the branch whose commits the “working branch” must contain. A
dependency is owned by durable issue configuration when available. “Aligned”
means the comparison shows no parent commits missing from the working branch.

## 4. Goals, non-goals, and fixed invariants

### 4.1 Goals

1. Parent drift MUST become visible without invoking an agent.
2. Sync MUST never push work prepared from stale remote heads.
3. Conflict assistance MUST be path- and state-bounded.
4. Newly required human action MUST be visible without notifying on every push.

### 4.2 Non-goals

1. The observer does not run Bugbot, issue sizing, or full commit automation.
2. Sync does not rebase, force-push, auto-merge PRs, or resolve release reconciliation.
3. The fixer cannot choose branches or git operations.

### 4.3 Fixed product/safety invariants

1. Observer workflows MUST remain agent-free and all-branch.
2. Deletion pushes and invalid/same parent-child targets MUST not merge.
3. Sensitive/workflow paths and >20 conflicts MUST not use automated fixing.
4. Verification runs credential-free; only trusted fetch/push receives credentials.
5. Both remote heads MUST match preparation immediately before commit/push.
6. Only an aligned-to-stale transition with a canonical source head MAY create
   an action notification; a fingerprint replay MUST create none.

## 5. Current versus proposed product journey

| Stage | Broad/unsafe alternative | As-built contract | Effect |
|---|---|---|---|
| Observe | full commit workflow | metadata-only observer | low cost/no model |
| Notify | comment per push | one status card plus transition-only notification | current state stays visible without hiding newly required action |
| Merge | agent always | clean git merge first | deterministic |
| Conflict | unrestricted edits | exact conflict-path guard | bounded risk |
| Push | trust checkout | remote-head compare | race safety |

The implemented product change adds the transition-only notification without
changing dependency discovery, merge, authorization, or conflict safety.

## 6. Functional behavior and state model

### 6.1 Happy path

1. Observer resolves and compares an affected dependency.
2. It creates or updates a stale status card with branches and next command.
   Initial creation is the event's only notification.
3. Authorized maintainer invokes sync; clean merge is prepared and verified.
4. Remote heads remain unchanged; trusted code commits/pushes.
5. The bot-authored push runs the observer and resolves downstream/current cards.
6. If a later parent push makes an aligned card stale, the observer updates the
   card and creates one short notification linked to it.

### 6.2 Alternative paths

- Already aligned returns a no-op result.
- Dry run reports clean/conflicted, aborts, and invokes no agent.
- `--no-agent` permits clean merge and safely aborts conflict.
- `--from` overrides only the parent after ref validation.
- Eligible conflict invokes fixer, validates exact paths/state, then follows normal verify/push.

### 6.3 State model

| State | Meaning | Next | Recovery |
|---|---|---|---|
| unknown relation | no parent/working fact | observed when linked | create/link PR/config |
| aligned | no parent drift | stale | parent advances |
| stale | status card active | preparing/aligned | invoke sync/manual merge |
| preparing | exact heads/merge prepared | conflicted/verifying/aborted | wait |
| conflicted | git conflicts exist | fixing/aborted | eligible fixer/manual |
| verifying | merge state/commands checked | pushing/aborted | repair tests |
| pushing | heads revalidated | aligned/failed | inspect remote |
| aborted | no push completed | stale | retry latest |

Replays keep the same card and do not repeat a transition fingerprint.
Parent-child chains are reevaluated after bot
pushes. Any failure attempts merge abort and reports whether no push occurred.

## 7. User-facing configuration

| Input/option | Default | Allowed | Persistence |
|---|---|---|---|
| `check_branch_sync_action` | workflow-owned | exact single action | per observer run |
| `--dry-run` | false | flag | command only |
| `--no-agent` | false | flag | command only |
| `--from <branch>` | discovered parent | one validated ref | command only |
| fixer role tuple | common agent inheritance | validated provider/model/effort/command | run |
| verify commands | empty | bounded parsed commands | repository/run |

All-branch observation, no agent in observer, no-ff merge, conflict/file limits,
sensitive paths, credential isolation, remote-head validation, and no force push
are not configurable.

## 8. Clean Architecture design

| Boundary | Owns | Must not own/import |
|---|---|---|
| Domain | command options/natural-language phrase | Git/GitHub |
| Policies | dependency normalization, eligibility, outcome presentation | subprocesses |
| Use cases | observe and synchronize sequencing | provider DTOs |
| Ports | dependency query, compare, workspace, fixer, git, auth | concrete clients |
| Adapters | GraphQL pagination, Git workspace, timers | product policy |
| Workflows | event/permissions/composition inputs | agent configuration in observer |

```mermaid
flowchart LR
  P[Push] --> O[Observer use case]
  O --> D[Dependency/compare ports]
  C[Authorized command] --> S[Sync use case]
  S --> W[Workspace port]
  S --> F[Optional fixer port]
  S --> G[Trusted git port]
```

Architecture and workflow contract tests MUST forbid agent inputs in the
observer and keep git/provider implementations outside application policy.

## 9. UI/UX and content contract

```markdown
Pending: **`feature/B` is 3 commits behind `feature/A`.** No automatic merge is running.
Action required: **Synchronize the branch.** Run `/copilot sync-branch` in issue #42.
Blocked: **2 conflicts include `.github/workflows/ci.yml`.** Automated resolution is forbidden; merge manually.
Partial: **Merge prepared, but verification failed.** Nothing was pushed; the stale card remains.
Complete: **Merged `feature/A` into `feature/B` and pushed `abc1234`.** The card is resolved.
```

One sticky issue card owns current drift and links parent, working branch,
issue/PR, and command guidance. The first stale observation creates only this
card. An aligned-to-stale transition may additionally create this default-English
message:

```markdown
Branch synchronization needs attention: `feature/B` is behind `feature/A`. [Open the current status](https://github.com/example/project/issues/42#issuecomment-8).
```

The transition message is at most 400 characters and two links, is immutable
after publication, and is deduplicated by bot ownership, dependency identity,
closed action, and canonical push head—not by its wording. Command results name
outcome, verification count, and commit SHA when present. `--dry-run` explicitly
says nothing was pushed. English is the default and fallback; the configured
issue locale supplies one complete catalog for the card, transition, and
duplicate pointer. Visual icons have text; untrusted refs, translated Markdown,
paths, and diagnostics are sanitized.

## 10. Failure, recovery, and cleanup

| Failure | Impact | Retained facts | Retry | Action | Cleanup |
|---|---|---|---|---|---|
| relation unavailable | no comparison | issue/PR facts | yes | link PR/config | none |
| compare/provider error | card may be stale | prior card | yes | rerun observer | none |
| ineligible conflict | no push | merge aborted | after manual resolution | merge manually | abort |
| verification/state fail | no push | remote branches | yes | fix command/code | abort |
| head race | no stale push | new heads | yes | rerun | abort |
| post-push card update fails | merge exists, card stale | commit SHA | yes | rerun observer | no commit rollback |
| action-notification create fails | stale card is current but the timeline alert may be absent | updated stale card and failing result | no domain replay | open the card from the run | later stale runs remain quiet |
| exact concurrent notification duplicate | duplicate timeline item | oldest exact bot-owned notification | automatic | none | delete duplicate or compact it to a localized pointer |

## 11. Security, permissions, and privacy

Observer has read-only implicit token permissions and uses explicit PAT only for
needed GitHub reads/comment writes. Sync requires fresh actor authorization.
Branch refs, issue markers, PR content, conflict paths, fixer output, and verify
commands are untrusted and validated. Credentials are scoped to trusted
subprocesses; agent/verification environments are credential-free. Sensitive
paths, unexpected index/worktree changes, and control sequences fail closed.

## 12. Observability and operational UX

Observer logs dependency count/comparison outcomes without agent telemetry.
Sticky cards expose current stale/aligned fact. The repository-locale Job
Summary records transition topic, target, fingerprint, created/reused effect,
and bounded duplicate-compaction IDs without copying visible prose. Sync result payload includes
outcome, branches, initial SHAs, conflicts, verification count, and commit SHA.
Failures say “no push completed” when true. Workflow contracts ensure bot pushes
remain observable and downstream relationships can update.

## 13. Compatibility, migration, rollout, and rollback

Durable configuration is preferred; existing linked branches/PR references and
legacy stale/aligned markers are fallback-compatible. New transition writes use
the shared semantic envelope; unknown, malformed, human-authored, and third-party
markers are inert. Installing or removing the observer does not change branch
history. Rollback disables transition creation with the observer or workflow;
existing cards and immutable notifications remain ordinary GitHub comments, and
any completed merge remains an auditable commit reverted normally if necessary.

## 14. Testing strategy and numeric budget

| Area | Minimum cases | Risks |
|---|---:|---|
| Commands/dependency/eligibility | 24 | options, links, limits, sensitive paths |
| State/idempotency/races | 24 | card/transition replay, concurrent duplicates, chains, remote heads, abort |
| Use cases/workspace | 22 | clean/conflict/dry-run/verify/push |
| Adapters/workflow contracts | 16 | pagination, git states, all-branch/no-agent |
| UX/localization/sanitization | 14 | cards, transition/pointers, arbitrary locale, refs, translated controls, errors |
| Integration/security/migration | 16 | observe→sync→resolve→stale, credentials, semantic/legacy fallback |
| **Total** | **116** | no double counting |

Global thresholds remain; dependency/eligibility policies SHOULD reach 95%
branch coverage. Fake git/GitHub/timers replace live services and waits. Tests
must exercise interrupted merge states and remote races. Manual evidence covers
sticky card updates, transition notifications, chained branches, PR/issue rendering, and conflict guidance.

## 15. Documentation and discoverability

| Audience | Artifact | Required content |
|---|---|---|
| Contributor | branch synchronization | card, notification lifecycle, and commands |
| Maintainer | comment commands | authority/options |
| Operator | troubleshooting/security | abort/race/credentials |
| Developer | this SDD/architecture | ports and git boundary |

## 16. Acceptance scenarios

1. Any non-deletion branch push checks only affected open dependencies with no agent.
2. An initial stale push creates one card and no second comment; identical stale
   pushes mutate nothing, while a changed comparison updates only that card.
3. Dry run reports clean/conflicted and leaves worktree/remote unchanged.
4. Clean sync verifies and pushes without fixer.
5. Unauthorized, same-branch, invalid-ref, sensitive, or >20-conflict requests do not push.
6. Eligible conflicts allow only conflict-path edits and valid merge state.
7. Verification or remote-head race aborts and reports no push.
8. Bot push triggers observer and updates dependent child relations.
9. Untrusted paths/refs/output cannot expose credentials or escape commands.
10. An aligned-to-stale transition with a canonical source head updates the card
    and creates one localized linked notification; replay creates none.
11. Concurrent exact transition notifications retain the oldest bot-owned
    comment and delete or compact later duplicates without touching other users.
12. A transition-publication failure preserves the already updated stale card,
    returns a sanitized publication failure, and does not replay branch work.

## 17. Requirements traceability

| Requirement | Owner | Evidence | Documentation |
|---|---|---|---|
| dependency discovery | policy/repository | dependency tests | detection flow |
| sticky observer and actionable transition | observe use case + shared transition workflow | observer/policy/reconciliation tests | branch sync lifecycle |
| safe merge | sync use case/workspace | sync/workspace tests | align branch |
| conflict boundary | eligibility/workspace policies | security/path tests | conflict boundary |
| workflow separation | workflow validator | contract tests | why separate |

## 18. Maintenance sequence

1. Update command/dependency/eligibility policies and tests.
2. Update observer/sync use cases including replay/race cases.
3. Update GraphQL/git/time adapters and workflow checks.
4. Update cards, notifications, results, docs, and catalog.
5. Run full automated and human branch-chain UX validation.

## 19. Definition of Done

- [x] The 116-case budget, coverage, architecture, and workflow gates pass.
- [x] Clean/conflict/dry-run/replay/race/abort paths retain correct state.
- [x] Agent, verify, and credentials remain in separate trust boundaries.
- [x] Card/transition states, links, localization, accessibility, and noise budgets pass.
- [x] Documentation and catalog evidence are current.
- [x] Repository PR checks exercise the observer and publication behavior; live
      conflict resolution remains covered by the established fake-workspace suite.

## 20. References and decisions

- Primary sources: catalogued branch-sync code, workflows, tests, and docs.
- Related SDDs: managed issue lifecycle; comment automation; agent runtime.
- Decision: observe cheaply on all branches; invoke fixer only for eligible conflicts.
- Rejected: full commit workflow everywhere, force push, agent-owned git.
- Follow-up: indexed dependency storage/performance study is outside this baseline.
