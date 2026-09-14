# Dependency Rules and Architectural Invariants

This document defines the dependency direction and the rules enforced by the
current source and architecture tests. A target rule must not be described as
already enforced when the current source still has a known exception.

## Target direction

```text
entrypoint
  -> lifecycle/capability composition
    -> application workflow/use case
      -> semantic application port
        -> specialized adapter
          -> provider client contract
            -> provider SDK / HTTP / CLI / Git / filesystem
```

Inner behavior reaches outer details only through contracts owned by the
appropriate inner boundary.

## Current physical layers

### Pure model and policy subset

Pure models and deterministic policies currently live under
`src/data/model/` and `src/domain/`. Every production file in those directories
is dependency-pure: it imports only other model/policy code or standard
TypeScript types, and therefore does not know about application use cases,
provider adapters, entrypoints, SDKs, process/filesystem APIs, or concrete
logging.

Direct import analysis previously found an unjustified SCC around `Execution`,
release/hotfix resolution helpers, application use cases, and
`ExecutionConfigurationPort`. Phase C removed that SCC without splitting the
model for metric cosmetics. Setup and branch-version resolution now belong to
`SetupExecutionUseCase` and `ExecutionBranchVersionResolver`, while the
configuration port accepts a semantic query instead of importing the aggregate
model. A Tarjan-based production architecture test rejects static, re-export,
side-effect, `require()` and dynamic-import cycles. The current productive graph
contains no directed dependency cycle.

The runtime setup capability now receives a deeply readonly
`SetupExecutionContext` and returns a discriminated `SetupExecutionResult`.
Issue resolution, release/hotfix description readers, and branch-version
resolution no longer receive or mutate `Execution`. Repository coordinates and
the token are bound once by `execution_setup_composition_root.ts`; the semantic
ports exposed to application code accept only operation facts such as an issue
number. The action boundary is the sole owner of applying the explicit result
back to the runtime aggregate.

Pure domain/model policies may import:

- standard TypeScript types;
- other pure models and policies.

They must not import:

```text
application use cases
infrastructure
entrypoints
@actions/*
@octokit/*
provider DTOs
filesystem/process APIs
concrete logging
```

A future physical `domain/` move is optional organization work, not a condition
for architectural correctness: the enforced rule is dependency purity rather
than a directory name.

### Application

Application owns:

- use cases and workflows;
- semantic capability ports;
- application request/response contracts;
- orchestration and application policies.

Application workflows report through the semantic
`src/application/ports/logging_ports.ts` contract. The concrete logger,
console formatting, and accumulated-report implementation are installed by
`src/infrastructure/logging/logger_adapter.ts` at the runtime boundary. This
keeps logging behavior replaceable and prevents application code from knowing
about the process/GitHub logger.

Application may use only the following side-effect-free shared utilities:
`comment_watermark`, `content_utils`, `list_utils`,
`project_context_instruction`, `secret_redaction`, `task_emoji`, and
`title_utils`. Action input keys and product constants belong to their owning
application/data contracts rather than a generic utility module. New reusable
application behavior belongs in an application policy or port rather than in
the generic utility directory.

Application production code may import application modules and approved
model/policy types. Provider-specific client contracts live under
`src/infrastructure/github/ports/`; they are never application ports and must
not be imported by application behavior.

Application must not import:

```text
data/repository concrete adapters
manager concrete adapters
infrastructure
entrypoints
@actions/*
@octokit/*
fetch / child_process / filesystem
provider-specific agent DTOs
concrete factories or composition roots
```

Type-only imports do not excuse semantic coupling to an outer implementation.

### Specialized adapters and infrastructure

Specialized adapters currently live mainly under `src/data/repository/`.
Provider transports and client factories live under
`src/infrastructure/github/` and `src/infrastructure/composition/`.

These layers own:

- provider mapping and DTO translation;
- REST/GraphQL documents and pagination;
- provider error classification;
- Git, process, and filesystem effects;
- concrete logging integration;
- implementation of application ports.

Agent command parsing, validation, and configuration merging are application
policies under `src/application/policies/`. Agent CLI and provisioning
adapters only translate and execute those decisions. Local-action input
assembly is split into focused readers under
`src/actions/local_action_configuration_sections.ts`, while the entrypoint
only coordinates their results.

They must not absorb application decisions merely to share HTTP or SDK syntax.
GraphQL transport contracts remain under `src/infrastructure/github/ports/` and
must not leak into application.

### Composition

Composition owns concrete construction, dependency graph assembly, scopes, and
lifecycle-specific sharing. Current composition is split across:

```text
src/infrastructure/composition/**
runtime entrypoints for lifecycle-local dependencies
```

The required direction is a named root for every runtime capability or use-case
graph. Phase D moved route-specific assembly and workflow-queue wiring to named
roots. The local action lifecycle now uses
`local_action_composition_root.ts`, which owns the shared Project Board scope and
the Git tag-query adapter.

Deployment command composition is a GitHub-workflow-only boundary. The local
surface rejects orchestration and publication commands before main-run
composition, and the shared route root leaves deployment state, PR, Git,
publication, and release/tag command ports unconstructed for that surface.
There is no compatibility or legacy mutation route.

Deployment orchestration selects one of four fixed entry-mode handlers for
prepare, continuation, publication confirmation, or failure recording. Those
handlers receive `DeploymentOrchestrationContext`, never the complete
`Execution` aggregate. Managed PR mutation, target-rule/merge-queue inspection,
and Git refs/ancestry are separate application ports and concrete adapters; the
former broad deployment repository no longer exists. ESLint enforces a maximum
cyclomatic complexity of 15 for every target-rule normalization function.

Issue and pull-request orchestration use cases receive their executable steps as
explicit application contracts. Their concrete step instances are assembled in
the corresponding infrastructure composition roots; application orchestration
does not instantiate sibling use cases or adapters.

Composition roots may depend on outer details and application contracts, but
must not become universal registries or service locators.

### Entrypoints

Entrypoints own input/event extraction, command registration, request mapping,
result publication, and runtime failure policy.

The independent lifecycles are:

```text
GitHub Action
Local action
CLI
```

They may share pure input policies, application requests/use cases, and result
contracts. They must not share GitHub context extraction, `core.setFailed`,
CLI exit handling, or provider lifecycle ownership.

## Capability port rules

Application ports describe semantic capabilities such as:

```text
ConfigurationStorePort
IssueLifecyclePort
PullRequestReviewerPort
PullRequestReviewCommentQueryPort
PullRequestReviewCommentCommandPort
PullRequestReviewThreadCommandPort
ProjectBoardCommandPort
OrganizationMembersPort
RepositoryReleasePublicationPort
DeploymentStateStorePort
DeploymentPublicationReceiptPort
```

When one adapter implements several operations, application callers still
receive the narrowest semantic subport they need. In particular, finding
resolution may list/update review comments and resolve a thread, but it must not
receive review-comment creation merely because the same adapter implements it.

They must not expose Octokit request parameters, endpoint names, GraphQL query
strings, OpenCode response parts, provider agent IDs, or raw response
envelopes. Provider client contracts may use provider-shaped DTOs only outside
application behavior.

Provider exceptions are translated at the specialized adapter boundary into
operation-specific semantic errors. Raw provider messages, causes, request
parameters, tokens and GraphQL transport details must not cross application
ports, enter `Result.errors`, or be interpolated into logs. Command outcomes
remain observable through every productive caller; partial success must not be
reported as unconditional success.

`Result.errors` is exactly `readonly ApplicationError[]`. The error code fixes
its category and default retryability; a caller may narrow a retryable error but
cannot broaden a terminal one. Raw causes are private and disposable. The
logging contract accepts only text already known to be safe or the allowlisted
public error record, and an AST check rejects caught values passed to any
production logger unless they first cross `toApplicationError`. The check
propagates taint through local declarations and assignments, so interpolating a
provider error into an intermediate `message` variable is not a bypass.

The checked-in `src/architecture/execution_import_baseline.json` is the exact,
non-growing boundary inventory. Every entry has a closed role and a substantive
justification. The compiler-based test resolves the canonical `Execution`
symbol, so type-only imports, renamed imports, re-exports,
`Pick<ExecutionAlias, ...>`, and local type aliases count as dependencies. A
synthetic negative fixture exercises those indirect forms. Any addition,
removal, move, duplicate, unknown role, blank rationale, or inventory mismatch
fails CI; an intentional reduction updates the file and its maximum together.
The P2-A setup cut and exact-inventory correction reduced that ratchet from 140
to 130 consumers: six setup imports were removed and four already-stale entries
were deleted. P2-B then moved five Bugbot analysis leaves to nested immutable,
credential-free `BugbotContextSelectionContext` and
`BugbotReviewOperationContext` contracts, reducing the ceiling to 125.
P2-C bound Bugbot SCM/Git authority and reduced the ceiling to 104. P2-D then
moved comment orchestration, permissions, translation, Think, title, result
publication, configuration persistence, and project linking to immutable
capability records backed by repository-bound semantic ports, reducing the
ceiling to 75. P2-E moves all issue and pull-request step leaves plus their step
interfaces to immutable capability requests, binds lifecycle authority in
composition, and reduces the ceiling to 47. The issue and pull-request step
directories have an additional exact zero-import rule; aliases, token-bearing
requests, `Pick<Execution>`, and compatibility overloads do not satisfy it.
Every merged P2 slice must lower the checked-in maximum by the imports it removes.

P2-F applies the same rule to push and single-action behavior. Release/tag,
setup, progress, recommendations, inactivity, issue-comment publication, branch
observation/synchronization, commit notification and sizing, activity markers,
and deployment leaves receive capability-specific readonly records, never the
aggregate. `push_single_action_capability_port_binding.ts` owns repository and
credential scope; its application-facing methods cannot accept replacement
coordinates or a token. Deployment receives a private invocation-state copy and
persists only through its fenced bound state port. Recommendation and activity
mutations return explicit outcomes for route application. The exact production
consumer ceiling is now 13; aliases, aggregate-shaped generics, overloads,
delegating shims, and token-bearing contexts remain forbidden.

P2-G closes the boundary without manufacturing a smaller number for its own
sake. The 13 remaining consumers are exactly aggregate constructors,
entrypoint-owned lifecycle/publication modules, the top-level route contract,
or route coordinators. Lifecycle synchronization no longer uses the structural
`LifecycleSynchronizationExecution` alias: the entrypoint projects a frozen,
credential-free, provider-independent target/evidence snapshot. The use case
receives bound label and pull-request-head capabilities and returns a frozen
label patch; only `common_action.ts` applies that patch after provider success.
A verified pull-request conversation comment therefore targets PR labels even
though its GitHub event name is `issue_comment`.

Specialized coverage budgets are data-only declarations in
`coverage-budgets.json`, interpreted by the sole
`validate-coverage-budgets.cjs` executable. A gate declares exact files (or an
exact discovered count), aggregate versus per-file evaluation, and a bounded
threshold profile.
Do not copy coverage parsing or percentage arithmetic into another validator;
missing entries, boundary percentages, zero-total metrics, and inventory drift
are enforced once and covered by negative tests.

Route-owned mutable state must not leak back into these leaves. Branch
preparation returns a frozen, field-bounded patch and only the issue coordinator
applies it after the step returns. A bound port owns repository coordinates and
credentials; its application-facing method accepts only the facts required for
one operation. PR-link adapters derive their network target from that bound
identity and a validated positive PR number, never from an event URL.

The package subpath `@vypdev/copilot/bugbot` exposes one review operation,
`review(BugbotReviewRequest)`. It does not export the internal `Execution` or
`Ai` models and has no aggregate-based overload or compatibility surface.

## Forbidden abstractions

Do not introduce:

```text
UniversalRepository
BaseRepository
GithubEverythingClient
AiEverythingService
GenericProviderAdapter
Pick<AggregateFacade> as a substitute for a semantic port
aliases or delegating shims for retired imports
```

Shared internal transport is allowed below separate semantic adapters when
transport semantics and lifecycle are genuinely shared.

## Construction rules

Application and pure model/policy code must never construct concrete adapters or
concrete use cases.
Constructor dependencies are explicit; application constructors must not have
default concrete implementations.

Concrete construction is expected in named composition roots and may currently
occur at a documented lifecycle boundary. Before moving it, audit:

1. all callers;
2. lifecycle ownership;
3. required instance sharing;
4. failure/publication behavior;
5. focused and composition tests.

File location alone is not sufficient justification for a refactor.

## Enforced rules today

Executable tests currently verify at least:

1. application has no production imports of infrastructure or manager adapters;
2. application does not construct listed concrete repositories/factories;
3. GraphQL transport contracts do not leak into application;
4. `Execution` does not construct retired repository/identity composition;
5. CLI delegates to the local lifecycle rather than `mainRun` directly;
6. GitHub and local lifecycles remain separate;
7. shared input policies remain independent from lifecycles/infrastructure;
8. retired aggregate-facade imports do not escape approved composition areas;
9. application ports do not import technical GraphQL/provider details;
10. `main_run_dispatcher.ts` does not construct concrete use cases, repositories,
    or adapters and does not import provider details.
11. the exact `Execution` allowlist has only approved roles and justified entries,
    and an alias/re-export fixture proves symbol-level detection;
12. lifecycle contexts are credential/DTO-free, lifecycle ports are bound, and
    locally derived caught values cannot reach logging.

Primary tests:

- `src/application/__tests__/architecture_boundaries.test.ts`;
- `src/actions/__tests__/composition_boundaries.test.ts`;
- `src/infrastructure/composition/__tests__/facade_boundaries.test.ts`;
- boundary suites under `src/application/ports/__tests__/` and
  `src/infrastructure/**/__tests__/`.

## Known review targets

- keep the final justified `Execution` boundary at 13 consumers or fewer;
- keep provider-specific release/tag contracts behind application ports;
- extend the executable boundary tests when a new layer or composition root is
  introduced.

## Acceptance standard

A boundary is complete only when source imports, constructor wiring, focused
behavior tests, architecture tests, Graphify topology, and runtime behavior all
agree. A passing regex test or improved RepoWise score alone is insufficient.
