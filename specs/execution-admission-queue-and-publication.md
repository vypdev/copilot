# Execution Admission, Queueing, Routing, and Result Publication

- Status: As-built baseline with review-evidence and native coordination hardening
- Date: 2026-09-15
- Last verified: 2026-10-25; issue #692 coordination regression verification
- Owners: Copilot maintainers
- Scope: the shared GitHub Action lifecycle from an incoming event to visible results and persisted execution state
- Related issues/PRs: architecture quality and scalability hardening SDD;
  [PR #363](https://github.com/vypdev/copilot/pull/363);
  [PR #378](https://github.com/vypdev/copilot/pull/378);
  [issue #692](https://github.com/vypdev/copilot/issues/692); historic motivation
  before that live evidence is not recoverable from repository evidence
- Required review gates: product UX, architecture, testing, documentation, security/operations
- Open decisions blocking readiness: none for the baseline; see known debt and limitations

## 1. Executive summary

Copilot admits an event before expensive setup, verifies native resource/lane
coordination or serializes mutation-capable runs per workflow, resolves one
application route, and publishes a bounded result to
the relevant GitHub conversation and Job Summary. A run created by the account
behind the workflow PAT is ignored unless it is an explicit valid single action.
The native `Copilot / Review` name is reserved for results carrying exactly one
current-schema Bugbot telemetry snapshot for the exact head. A valid snapshot
does not hide a second malformed owned snapshot: the complete set is ambiguous
and publishes no Review Check. Metadata-only or ambiguous PR runs retain their
workflow result and Job Summary without impersonating or hiding review
evidence; successful metadata edits also omit redundant generic conversation
comments.

```text
GitHub event -> actor admission -> queue -> execution setup -> one route
             -> lifecycle reconciliation -> comment/summary/check -> stored state
```

The intentional safety rule is fail closed: missing identity, queue identity, or
route prerequisites MUST NOT be treated as permission to mutate.

## 2. Problem, current behavior, and evidence

### 2.1 Problem

Every issue, PR, push, comment, and single-action workflow needs the same answer
to four questions: may it run, may it overlap, which use case owns it, and where
will a human see the outcome. Duplicating those decisions in workflows would
create inconsistent authorization and failure behavior.

### 2.2 Current behavior

1. `runGitHubAction` resolves the event, token user, and single-action request.
2. Bot-authored normal events are discarded; valid explicit single actions pass.
3. Only agent roles reachable by the event are prepared, subject to
   `ai-members-only` authorization.
4. Before setup, `mainRun` verifies the executing job's native resource/lane
   coordination as specified in §6.4. Without that proof it waits for older
   active runs of the same workflow. The dedicated failure-comment action stays
   runnable when queue verification fails.
5. Setup restores issue, branch, and durable operation state; the route policy
   selects exactly one of issue, issue-comment, PR, review-comment, push, or
   single-action.
6. Results reconcile lifecycle/activity labels and are published to the target,
   Job Summary, optional semantic Check Run, and configuration marker as
   applicable. A PR result without exact-head Bugbot telemetry publishes no
   `Copilot / Review` Check. The supplied PR workflow does not subscribe to
   metadata-only `pull_request: edited`, so an automated body update cannot
   create another admission/publication cycle.
7. The first executed result error, malformed canonical finding-state evidence,
   an unknown Bugbot state, or configured unresolved findings marks the Action
   failed.

### 2.3 Evidence and contract classification

- Observed behavior: `src/actions/github_action.ts`, `common_action.ts`,
  `main_run_lifecycle.ts`, `main_run_route.ts`, and
  `github_action_completion.ts`.
- Intentional contract: early bot-loop admission, verified native resource/lane
  coordination with workflow-scoped serialization as the conservative fallback,
  single-route ownership, sanitized publication, and fail-closed errors.
- Known debt and limitations: queue state is polled and bounded by a 90-minute
  internal budget; optional Check Run publication is best-effort; 26 production
  application paths pass a caught `unknown` directly into `Result.errors`; 127
  production application files import the shared `Execution` aggregate; no live
  UX capture is stored in the repository.
- Unknown rationale: why workflow-scoped polling was originally chosen instead
  of only GitHub concurrency is not established by current evidence.
- Proposed improvements: the semantic-error replacement and shrinking
  `Execution`-context allowlist are specified in
  [`execution-error-and-context-hardening.md`](./execution-error-and-context-hardening.md),
  under the sequencing and cross-cutting gates in
  [`architecture-quality-and-scalability-hardening.md`](./architecture-quality-and-scalability-hardening.md).
  Issue #692 corrects a verified scheduler inversion: a later PR job occupied a
  shared runner while waiting for an older queued job for a different PR. That
  predecessor needed a runner from the same finite pool. The solution below
  recognizes the existing native lanes rather than increasing the wait budget.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Entry point | Visible surfaces |
|---|---|---|---|
| Contributor | trigger automation | GitHub event/comment | issue, PR, check |
| Maintainer | operate/recover a run | workflow dispatch or retry | run, Job Summary |
| PAT account | perform provider mutations | explicit single action | audit log/run |
| Copilot | execute one bounded route | `action.yml` | comments, labels, summary |

“Admission” decides whether a run enters setup. “Queue” prevents older runs of
the same workflow from overlapping. “Result” is the application-level fact;
presentation adapters decide where that fact appears.

## 4. Goals, non-goals, and fixed invariants

### 4.1 Goals

1. Every accepted event MUST resolve to at most one top-level route.
2. Mutation-capable workflow runs MUST have verified native resource/lane
   coordination, wait for older active workflow runs, or fail before setup.
3. Results MUST remain understandable without raw logs.
4. A named native Check MUST represent only its semantic capability; a metadata
   result MUST NOT supersede a same-head review in GitHub's latest-by-name view.

### 4.2 Non-goals

1. This contract does not define feature-specific issue, PR, Bugbot, or release behavior.
2. It does not promise exactly-once delivery from GitHub.

### 4.3 Fixed product/safety invariants

1. A normal event authored by the PAT user MUST NOT recursively execute.
2. Invalid or missing workflow identity MUST NOT bypass queueing.
3. Provider diagnostics and secrets MUST NOT be copied verbatim to comments.
4. A failed result MUST NOT be converted to a successful process exit.
5. Bounded partial, skipped, and superseded Bugbot review outcomes MUST be
   neutral; metadata-only PR completion MUST publish no Review Check.
6. Finding-state evidence MUST use the complete canonical seven-state schema
   with non-negative safe-integer counts and no additional state keys. Missing,
   malformed, or arithmetically overflowing owned evidence MUST fail closed.
7. Metadata-only PR edits MUST NOT create generic result comments; their native
   workflow conclusion and Job Summary are the bounded operator surfaces.

## 5. Current versus proposed product journey

| Stage | Pre-baseline understanding | As-built contract | Effect |
|---|---|---|---|
| Admission | implicit in entrypoint | explicit identity decision | bot loops stop early |
| Queue | every run polls the entire workflow | verify native lane before setup; otherwise fail-closed workflow gate | unrelated PRs do not hold runners waiting for each other |
| Routing | spread across handlers | one route policy | predictable ownership |
| Completion | comments only were assumed | route-owned comment when applicable + summary + optional check + state | evidence is inspectable without duplicate discussion noise |
| Review evidence | every PR completion could reuse the Review name | exact-head telemetry owns Review; metadata keeps workflow/summary only | latest-by-name remains truthful |

The baseline is retrospective except for the implemented semantic ownership
hardening described here: Review Check publication now requires exactly one
current-schema, exact-head Bugbot telemetry snapshot and incomplete outcomes are
neutral.

## 6. Functional behavior and state model

### 6.1 Happy path

1. Resolve trusted repository/event metadata and the PAT identity.
2. Admit, queue, build configuration, restore state, and dispatch one route.
3. Collect ordered results, reconcile labels, publish user and operator evidence,
   persist applicable configuration, and retain a successful exit status.

### 6.2 Alternative paths

- Queue-only mode admits the workflow and returns before application setup.
- A valid single action can run when actor and PAT user match.
- Events with no resolvable issue may run only issue-free single actions.
- Dry-run Bugbot results skip comments, state persistence, and checks.
- Metadata-only PR results publish their native workflow result and Job Summary
  but no `Copilot / Review`; no previous Check read/merge is performed.

### 6.3 State machine

| State | Entered when | Meaning | Next | Recovery/owner |
|---|---|---|---|---|
| discarded | PAT user authored a normal event | intentional no-op | terminal | none |
| queued | older run exists | waiting safely | setup/failed | retry by maintainer |
| setup | identity/context loads | restoring facts | routed/failed | fix config/token |
| routed | one use case owns event | work is running | publishing/failed | inspect results |
| publishing | results exist | evidence/state being written | complete/partial/failed | retry idempotently |
| partial | core work succeeded, optional evidence failed | retained work remains valid | terminal | inspect run |
| complete | required work and publication succeeded | no action required | terminal | none |

Duplicate events are tolerated through route-specific idempotency and persisted
markers; this shared layer does not itself deduplicate GitHub deliveries.

### 6.4 Native coordination recognition — issue #692

The recommended installed Commit, PR analysis and PR review-state jobs already
declare native job concurrency. The runtime MUST recognize that exact contract
before setup, without a user-controlled bypass input and without enumerating
older runs when native coordination is proven.

```text
Validate run/workflow identity
  -> eligible normal event + pinned workflow/job metadata?
     -> read executing workflow at GITHUB_WORKFLOW_SHA
        -> exact job concurrency proven? -> setup -> existing guarded route
        -> custom/legacy shape? -> existing predecessor queue -> setup
     -> no eligible metadata? -> existing predecessor queue -> setup
  -> provider/parse error or deadline -> fail before setup
```

Text equivalent: native proof delegates coordination to GitHub; missing proof
retains the predecessor fence; errors never grant permission to execute.

| Normal event/resource | Required literal job group | Native cancellation |
|---|---|---|
| Branch `push` | `copilot-push-${{ github.repository }}-${{ github.ref_name }}` | `true` |
| `pull_request` with positive safe-integer PR number | `copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}-analysis` | `true` |
| `pull_request_review` with positive safe-integer PR number | `copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}-review-state` | `true` |

The entrypoint MUST use GitHub's workflow ref, workflow commit SHA and current
job ID, bound to the current repository, rather than a checked-out file, workflow
display name or filename allowlist. Single actions, missing/invalid metadata,
tag pushes, unrelated events, reusable or multi-job workflows, workflow-level concurrency and
nonmatching groups MUST retain the existing workflow queue. The source read is
limited to a normal YAML workflow file at a full 40-hex commit SHA, at most
256 KiB. Parsing uses the JSON schema and executes no expressions or tags.
Recognition requires one direct job, preventing a reusable callee's job ID from
being mistaken for another protected job in the caller's workflow context.
Missing/malformed provider content, YAML errors, provider errors and exhausted
retry/deadline budgets MUST fail closed through the existing sanitized queue
failure. There is no disk fallback or read from a moving branch.

GitHub's native key owns serialization/replacement within the same resource and
lane; PR identity keeps two PRs sharing a head branch independent. No runtime
comparison of `head_branch` substitutes for PR identity. Existing head/base,
finding, permission, publication and deployment fences remain mandatory.
Durable issue/comment mutations and legacy/custom jobs retain active-status
pagination, same-workflow predecessor ordering, retries and the 90-minute bound.
The recognition read and any fallback queue share that absolute deadline.

No extra comments, checks or labels are introduced. A proven job logs
`Native workflow resource/lane coordination verified; continuing before setup.`
Legacy waiting and sanitized failures keep their existing messages. The run
and Job Summary remain the operator navigation surfaces. Cancellation before
setup leaves no application mutation; cancellation after setup retains the
existing route recovery rules.

## 7. User-facing configuration

| Input | Type | Recommended default | Allowed values | Scope/persistence |
|---|---|---|---|---|
| `debug` | boolean | `false` | `true`, `false` | per run |
| `token` | secret | required PAT | valid GitHub token | per run; never persisted in markers |
| `ai-members-only` | boolean | `false` | `true`, `false` | workflow/repository variable |
| `bugbot-fail-on-unresolved` | boolean | `false` | `true`, `false` | per run |

The 90-minute queue budget, exponential backoff, maximum 60-second delay,
jitter, admission rules, route precedence, and error-to-exit mapping are not
configurable. Inputs use Action values; stored issue configuration restores
operation facts but never secrets.

Native recognition adds no public configuration or persisted state. Recommended
setup uses the three exact job groups in §6.4; a custom workflow without those
groups is a supported conservative alternative. Missing or future metadata
selects the existing queue, never a permissive mode.

## 8. Clean Architecture design

| Boundary | Owns | Must not own/import |
|---|---|---|
| Domain/policy | admission, route, queue delay, publication selection | Octokit/core |
| Application | setup, waiting, lifecycle synchronization | provider DTOs |
| Adapters | GitHub queries, comments, checks, timers | route policy |
| Composition | concrete wiring | product decisions |
| Entrypoints | event/input/output adaptation | duplicated use cases |
| Presentation | sanitized comment, status, summary, and Check rendering | mutations |

```mermaid
flowchart LR
  G[GitHub event] --> E[Action entrypoint]
  E --> A[Admission and queue policies]
  A --> U[Application route]
  U --> P[Semantic ports]
  X[GitHub/time adapters] --> P
  U --> V[Result presentation]
```

Text equivalent: GitHub data is adapted at the entrypoint; pure policies and
application use cases decide; provider adapters satisfy ports; renderers expose
sanitized results. Architecture and cycle tests MUST prevent inward layers from
importing concrete infrastructure.

The entrypoint projects immutable workflow/job/event metadata before setup. The
waiting use case asks a semantic native-coordination query port once, then either
continues or uses its existing predecessor port. The GitHub adapter reads and
parses the pinned workflow; a pure application policy recognizes the exact group
and cancellation contract. Only infrastructure owns YAML/Octokit and environment
access stays at the entrypoint. Architecture import tests, workflow parser
contracts and the integrated scheduler-inversion regression enforce these
boundaries. No provider DTO or `Execution` dependency enters the pure policy.

## 9. UI/UX and content contract

The first view MUST say status, completed facts, next step, action, impact, and
links before technical detail.

```markdown
Pending: **Waiting safely for 2 older Copilot runs.** No action is required.
Action required: **Configuration could not be loaded.** Repair the PAT or inputs, then re-run.
Blocked: **Queue identity is unavailable.** No repository mutation started.
Partial: **Work completed; optional Check Run could not be published.** Inspect the Job Summary.
Complete: **Copilot execution succeeded.** Results and lifecycle state are up to date.
Review partial: **Bugbot reviewed bounded evidence but cannot declare the whole PR clean.** The Review Check is neutral.
Metadata only: **PR metadata normalization completed.** See this workflow summary; the analyzed Review Check is unchanged.
```

There SHOULD be at most one generic result comment per invocation. A
metadata-only PR edit creates zero; its workflow and Job Summary already carry
the result. Stable
markers, bounded error text, descriptive links, and headings provide narrow and
screen-reader-friendly output. English is the fallback for runtime/system text;
feature renderers may use configured issue or PR locales.

## 10. Failure, recovery, and cleanup

| Failure | Impact | Retained facts | Retry | Action | Cleanup |
|---|---|---|---|---|---|
| identity/admission | no work starts | none | yes | repair token | none |
| queue timeout/query | no route starts | older runs unchanged | yes | inspect/cancel older run | none |
| route failure | some steps may exist | result list/state | route-specific | read first error | route-specific |
| comment/state write | core work may be complete | result and logs | yes, idempotent | inspect summary | marker policy |
| optional check failure | summary remains | core result | optional | inspect logs | none |

Errors MUST follow impact → cause → action → retained state and distinguish a
publication failure from failure of already completed work.

## 11. Security, permissions, and privacy

Least-privilege workflow permissions remain workflow-owned. Actor identity is
read from GitHub context and compared case-insensitively to the token identity.
Event bodies and agent output are untrusted and sanitized before publication.
Secrets MUST stay in environment/action secret channels and be redacted from
logs, comments, summaries, errors, and persisted configuration.

## 12. Observability and operational UX

The Action emits bounded logs, application results, a Job Summary, the
`bugbot-telemetry` output, and optionally a Copilot Check Run. Repository/run,
event, target, lifecycle, result counts, and sanitized failures provide
correlation. Queue polling logs count and next delay without leaking responses.
Repeated unchanged state SHOULD not generate repeated discussion comments.
The shared telemetry projection is the only parser used by Job Summary and
native evidence. Its set result is explicitly `absent`, `invalid`, or `valid`.
It first counts every result that owns the telemetry field and accepts the set
only when that count is exactly one and the snapshot is valid; malformed
siblings cannot be discarded before cardinality is checked. The finding-state
projection consumes the same set decision before counts, so Action exit,
lifecycle, status, Summary, and Check ownership cannot disagree.
Missing/mismatched/ambiguous telemetry is observable as absence of a Review
Check, never as `Bugbot review: —` in a newer same-name Check. A second shared
pure projection validates and aggregates complete canonical finding-state
counts for Action exit, lifecycle, status, Job Summary, and Check. Valid
`completed`, `no-findings`, `partial`, and `dry-run` telemetry requires that
aggregate; omitting it is invalid. Metadata-only, `skipped`, `superseded`, and
`failed` results may keep it absent because they cannot claim a clean review.
Invalid evidence fails or blocks every current-state surface and is rendered
as `invalid`, never as zero findings.

## 13. Compatibility, migration, rollout, and rollback

For issue #692, consumers with the current native groups need only the fixed
runtime; workflow changes are unnecessary. Older/custom workflows keep the
queue. Roll out through a reviewed PR and the normal release process. A run
already waiting in an older runtime cannot adopt the fix in place; inspect its
predecessors and rerun after the fix is available. Changing concurrency keys
during an active run may overlap an old key, so existing freshness/idempotency
guards remain essential. Rollback restores the earlier runtime and its global
wait behavior; it does not undo provider mutations. Live consumer cancellation,
deployment and release are outside this issue's implementation authorization.

The native coordination increment changes no installed input or durable marker
schema. Existing production consumers retain their workflow groups and operation
state. Already completed provider mutations are never hidden or rewound;
incompatible state fails closed and recovery starts from inspectable provider
facts. The historical evidence-schema cutover remains documented in the linked
hardening specifications; it is not a migration introduced by issue #692.

## 14. Testing strategy and numeric budget

| Area | Minimum cases | Risk covered |
|---|---:|---|
| Admission/route/queue policy | 14 | bot loops, route precedence, delay bounds |
| Setup/state/idempotency/races | 12 | restored state, no issue, queue timeout |
| Adapters/error mapping | 8 | pagination, provider errors, timers |
| Workflow/setup contracts | 8 | queue gate, permissions, timeouts |
| Publication/UX/sanitization | 20 | targets, dry run, summary, errors, links, exact-head review eligibility, metadata-only Check/comment omission, discriminated malformed-sibling telemetry, required finding-state evidence, canonical projection, invalid status and incomplete neutral matrix |
| Integration/security/cutover | 8 | end-to-end routes, secrets, removed-shape rejection |
| **Total** | **70** | no double counting |

Repository thresholds (90% lines/statements, 88% functions, 82% branches)
remain mandatory; changed pure policies SHOULD reach 95% branch coverage.
Tests use fake clocks/randomness/providers and no live waits. Golden Markdown
needs semantic assertions. Human evidence remains required for desktop/mobile,
light/dark, and screen-reader order.

Issue #692 adds a minimum **24 distinct cases**, derived from the new proof
boundary: **12 pure policy/context** cases (three lanes, same-owner stability,
invalid resources/metadata, single actions and custom groups), **6 adapter**
cases (pinned contents, malformed content/YAML, endpoint errors, safe fallback
and bounds), **4 orchestration/integration** cases (scheduler inversion before
setup, retained mutation fence, native failure before setup and deadline), and
**2 shipped/setup workflow replays** proving different-PR independence and
same-resource/lane stability. Existing predecessor pagination/retry/error and
workflow mutant cases remain required. New pure policy targets at least 95%
branch coverage; changed adapters/use cases target at least 90% lines. Fake
providers, clocks and delays exercise the race without live runner sleeps.
No new graphical UI exists, so human visual captures are not needed for this
increment; native log copy is checked semantically.

## 15. Documentation and discoverability

| Audience | Artifact | Contract |
|---|---|---|
| User | `docs/overview.mdx` | event-to-result journey |
| Setup owner | workflow/setup docs | permissions and queue gate |
| Operator | troubleshooting | timeout, partial publication, retry |
| Contributor | architecture + this SDD | boundaries and route ownership |

Issue #692 updates `docs/features.mdx`, `docs/pull-requests/workflow-setup.mdx`
and the README with native proof, conservative custom fallback, pinned-content
read permissions, shared-runner recovery and unchanged safety guards.

## 16. Acceptance scenarios

1. Given a PAT-authored normal event, the run exits before queue or mutation.
2. Given a valid explicit single action from that account, it executes.
3. Given older active runs without native coordination proof, the current run
   waits with bounded jitter.
4. Given unavailable workflow identity on GitHub Actions, queueing fails closed.
5. Given a known event, exactly one route owns it.
6. Given successful core work and failed optional check publication, the summary
   reports partial evidence without claiming core failure.
7. Given untrusted output, published Markdown contains no executable/secret content.
8. Given a catalog/spec change, CI validates registered evidence and this contract.
9. Given a metadata-only PR result, the Job Summary is published and no
   generic conversation comment or `Copilot / Review` evidence call occurs.
10. Given exact-head Bugbot telemetry, complete/no-findings may succeed;
    partial/skipped/superseded are neutral; failed remains failure.
11. Given one valid telemetry snapshot plus any second malformed owned snapshot,
    no `Copilot / Review` Check is published.
12. Given complete canonical finding-state results, Action exit, lifecycle,
    `/copilot status`, Job Summary, and Check consume the same aggregate counts.
13. Given a missing state, extra state, invalid count, or aggregate overflow,
    the Action and eligible Check fail, lifecycle blocks, summaries say
    `invalid`, and no surface invents a clean state.
14. Given a valid finding-evaluating review outcome with no `findingStates`
    aggregate, the shared projection is invalid across Action completion,
    lifecycle, status, Summary, and eligible Check evidence; metadata-only and
    skipped/superseded/failed results retain a deliberate absent state.
15. Given valid zero finding-state counts plus malformed or duplicate owned
    telemetry, the telemetry-set and finding-state projections are invalid; no
    Review Check is published and every other current-state consumer fails or
    blocks instead of reporting success.
16. Given an older queued PR A and a later executing PR B on a finite shared
    pool, a proven native job reaches setup without enumerating predecessors
    or waiting; the shipped and setup workflow fixtures reproduce this.
17. Given successive events for the same PR/lane, GitHub's exact group stays
    stable; different PRs and analysis/review-state lanes remain independent.
18. Given a legacy/custom job, missing metadata, tag push or single action, the
    original predecessor fence blocks setup until older active runs finish.
19. Given malformed source, unreadable workflow content or an expired proof
    deadline, setup/routes do not run and raw provider diagnostics are absent
    from the public queue failure.
20. Given a misleading filename, different checkout or moving branch, native
    recognition uses only the executing repository/workflow SHA/job and rejects
    nonmatching contracts. Policy and adapter tests enforce the inspection bound
    and prohibit executable YAML tags.

## 17. Requirements traceability

| Requirement | Owner | Test/evidence | Documentation |
|---|---|---|---|
| admission invariants | admission policy/use case | admission tests | overview |
| serialization | queue policy/use case/adapters | queue + workflow tests | troubleshooting |
| §6.4 native proof and conservative fallback | native coordination policy/port/adapter + waiting use case | policy/context, pinned-content, scheduler-inversion and failure/deadline cases; shipped/setup replays | features and PR workflow setup |
| one route | route policy/dispatcher | route tests | architecture |
| safe publication | completion/presentation policies | completion tests | overview |
| metadata noise bound | explicit generic-comment publication mode | metadata-edit context/use-case/completion negatives | workflow setup and troubleshooting |
| semantic Check ownership | discriminated telemetry-set projection + evidence policy | outcome matrix + metadata-only and malformed/duplicate-sibling negatives | Bugbot detection, workflow setup, troubleshooting |
| canonical finding-state evidence | result-state projection + completion/lifecycle/status/summary/Check policies | strict schema, required-outcome absence, aggregation, overflow, fail-closed, and rendering tests | Bugbot detection, observability, failure scenarios, comment commands |
| dependency direction | architecture tests | boundary/cycle suites | architecture |

## 18. Maintenance sequence

1. Change contracts/pure policies and tests.
2. Change setup/route orchestration and deterministic race tests.
3. Change adapters and workflow structural checks.
4. Change presentation fixtures, documentation, and catalog evidence.
5. Run all quality gates and capture human UX evidence when visible content changes.

## 19. Definition of Done

- [x] Issue #692: the additional 24-case budget, policy/adapter coverage,
      scheduler inversion, same-resource contracts, sanitized failures,
      documentation, typecheck/lint, workflow and specification validation pass.

- [x] Normative changes have acceptance and traceability.
- [x] Architecture, workflow, catalog, and cycle checks pass.
- [x] The 70-case risk budget and repository coverage gates pass; both shared
      evidence projections maintain 100% line, statement, branch, and function
      coverage.
- [x] Queue, retry, cancellation, partial success, and idempotency are covered.
- [x] UI states, sanitization, accessibility, localization, and noise are reviewed.
- [x] User/operator/contributor documentation and catalog dates are current.
- [x] No secret or raw provider diagnostic reaches a public surface.

## 20. References and decisions

- Primary sources: catalogued code, workflows, tests, and documentation.
- Issue #692 primary provider contracts: [native job concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
  [workflow SHA and job metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/variables),
  and [repository content at a ref](https://docs.github.com/en/rest/repos/contents#get-repository-content).
  Decision: prove the executing job's existing native contract, then delegate
  to GitHub. Reject a filename-only allowlist, a caller bypass flag, checked-out
  YAML, branch-name predecessor filtering and larger timeouts: none establishes
  safe PR identity and native fencing before setup.
- Related specs: release orchestration, merge-queue readiness, Bugbot reconciliation.
- Planned hardening: `execution-error-and-context-hardening.md` owns the semantic
  error boundary and `Execution` context replacement; the architecture hardening
  SDD owns shared sequencing and verification gates.
- Decision: retain one shared lifecycle and semantic ports; reject route logic in YAML.
- Decision: omit Review evidence for metadata-only PR runs; reject reading and
  merging a previous Check because it adds a stale provider race and preserves
  semantic impersonation.
- Decision: omit generic comments for metadata-only PR edits; reject publishing
  lifecycle/debug-only summaries into the durable conversation because the
  native workflow and Job Summary already retain that evidence.
- Follow-up outside scope: durable event storage beyond issue configuration markers.
