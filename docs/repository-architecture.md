# Repository Architecture

## Purpose

This document describes the architecture of the current `master` checkout. It
is an implementation map and migration contract, not a request to create files
mechanically. Historical baselines and completed migrations live in
[`migration-baseline.md`](./migration-baseline.md). The remaining quality and
coverage work is governed by
[`repowise-perfect-metrics-plan.md`](./repowise-perfect-metrics-plan.md); current
coverage inventory lives in
[`COVERAGE_ACTION_PLAN.md`](./COVERAGE_ACTION_PLAN.md).

Use `git rev-parse HEAD` for the current published checkpoint; this document
describes the checkout that contains it and does not encode its own commit SHA.

## Dependency direction

```text
runtime entrypoint
  -> lifecycle/capability composition
    -> application use case or workflow
      -> semantic application port
        -> specialized adapter
          -> provider client contract
            -> GitHub / AI / Git / filesystem / process detail
```

The application layer owns use cases, workflows, semantic ports, and
application policies. Provider protocols, pagination, GraphQL documents,
Octokit DTOs, process execution, and concrete adapters belong outside
application behavior. The current checkout still has a documented transitional
exception: SDK-shaped `Github*Client` contracts under
`src/application/ports/github_*_ports.ts`. They form a shrinking allowlist to be
migrated capability by capability; no new exception or universal provider
facade is allowed.

`src/data/model/` currently contains domain models and pure model policies.
`src/data/repository/` contains specialized adapters and some pure repository
policies. These physical names are transitional; dependency direction and
semantic ownership matter more than a mass directory rename.

## Current capability families

### AI and agent execution

Findings and fixer behavior use separate application contracts. Runtime
configuration, authentication preflight, server lifecycle, findings execution,
and fixer execution remain distinct. The retired universal `ai_repository.ts`
must not be recreated.

Composition starts in:

- `src/infrastructure/composition/agent_capability_composition_root.ts`;
- `src/infrastructure/composition/bugbot_composition_root.ts`;
- action/CLI lifecycle composition where task-specific use cases are assembled.

### Configuration

- read/setup contracts: `ExecutionConfigurationPort` and execution setup ports;
- write contract: `ConfigurationStorePort`;
- concrete adapter: `ConfigurationHandler`;
- construction boundary: GitHub Action completion composition.

The read and write boundaries are complete. `SetupExecutionUseCase` owns setup
orchestration, `ExecutionBranchVersionResolver` owns release/hotfix resolution,
and `execution_setup_composition_root.ts` assembles their semantic ports and
child use cases. `ExecutionConfigurationPort` accepts a narrow
`ExecutionConfigurationQuery`; neither it nor `Execution` imports the other.
The former eight-module SCC has been removed and is guarded by a productive
dependency-cycle test. `Execution` remains the lifecycle state model rather
than being split by size.

`StoreConfigurationUseCase` depends on `ConfigurationStorePort`; application
architecture tests reject concrete manager imports.

### Issues

Issue behavior is partitioned into content, metadata, lifecycle, title, labels,
progress, assignment, type, notification, closure, and Bugbot capabilities.
There is no current production `IssueRepository` aggregate facade.

Primary composition roots include:

- `issue_use_case_composition_root.ts`;
- `issue_content_composition_root.ts`;
- `issue_metadata_composition_root.ts`;
- `issue_labels_composition_root.ts`;
- `issue_interaction_composition_root.ts`;
- `execution_issue_setup_composition_root.ts`.

### Pull requests

Changes, review, review threads, lifecycle, issue linking, description, and
branch lookup are separate contracts/adapters. There is no current production
`PullRequestRepository` aggregate facade.

`PullRequestChangesRepository` owns complete file pagination through its
private `listAllFiles` capability. Review and lifecycle remain separate unless
a real caller proves a cohesive aggregate contract.

### Project boards

`createProjectBoardCompositionRoot()` returns three semantic capabilities:

- `ProjectBoardQueryPort`;
- `ProjectBoardLinkPort`;
- `ProjectBoardCommandPort`.

The query adapter is intentionally shared by link and command adapters because
both require the same project-detail resolution contract. A composition test
covers that sharing. There is no current `ProjectBoardRepository` aggregate.

### Organization and identity

- `OrganizationMembersPort` -> `OrganizationMembersRepository`;
- `AuthenticatedUserPort` -> `AuthenticatedUserRepository`;
- `ActorAuthorizationPort` -> `ActorAuthorizationRepository`.

Organization membership pagination is owned by its adapter. Selection and
deduplication policies remain provider-independent. Authenticated execution
identity and commit identity details remain separate semantic methods even
though both use the same GitHub endpoint.

### Branch, release, and workflow

Branch comparison, merge, preparation, naming, lifecycle, linked branches,
tags, release publication, default branch, workflow-run queries, polling delay,
and workflow dispatch use separate ports/adapters. Workflow queue policy belongs
to `WaitForPreviousWorkflowRunsUseCase`; its composition root creates the query
and timer adapters once, outside the polling loop. The former aggregate
`WorkflowRepository` and callerless `WorkflowRun` model no longer exist.
Release construction starts in
`release_composition_root.ts` and release-specific client factories.

The release/tag correctness track still covers mapping, idempotency, malformed
responses, pagination, and provider errors. It must not merge release and tag
publication because they have different semantic contracts. Current sequencing
also prioritizes focused P0 project-board and branch contracts, as defined by
the authoritative perfect-metrics plan.

## Runtime composition

The current runtime topology is intentionally split:

- `src/actions/github_action.ts`: GitHub Action input/event lifecycle;
- `src/actions/local_action.ts`: local execution lifecycle;
- `src/cli.ts` and `src/cli/**`: CLI bootstrap, parsing, and commands;
- `src/infrastructure/composition/**`: capability and use-case roots, including
  `main_run_route_composition_root.ts` and `workflow_queue_composition_root.ts`;
- `src/actions/common_action.ts` and `src/actions/main_run_route.ts`: lifecycle route selection and unhandled failure policy;
- `src/actions/main_run_dispatcher.ts`: route logging and invocation of precomposed handlers only.

`cli.ts` is an 11-line bootstrap and is not an extraction target.
`local_action.ts` is a small lifecycle coordinator. Its one-time
`GitCliRepository` construction at the local runtime boundary is intentional;
caller and sharing analysis found no hidden provider loop or cross-lifecycle
coupling. An executable composition guard rejects concrete assembly in
`main_run_dispatcher.ts`. No move is justified by file location alone.

## Executable architecture rules

The main guards are:

- `src/application/__tests__/architecture_boundaries.test.ts`;
- `src/actions/__tests__/composition_boundaries.test.ts`;
- `src/infrastructure/composition/__tests__/facade_boundaries.test.ts`;
- application port boundary tests under `src/application/ports/__tests__/`;
- GitHub client/adapter boundary tests under `src/infrastructure/**/__tests__/`.

Application production code must not import concrete repositories, manager
adapters, infrastructure, entrypoints, Octokit, or provider-shaped DTOs. The
only current provider-protocol exception is the explicit SDK-shaped
`Github*Client` allowlist under `src/application/ports/github_*_ports.ts`; new
entries are forbidden and the authoritative plan requires capability-by-capability
migration until the allowlist is empty. Test-only concrete adapters do not
become production dependencies.

## Non-negotiable target rules

The rules below define the completed target. The transitional provider-contract
allowlist above is not evidence that rule 1 is already fully satisfied.

1. Ports represent semantic capabilities, not SDK method shapes.
2. Use cases receive required dependencies explicitly.
3. No default concrete dependency parameters in application constructors.
4. No universal GitHub/AI repository, generic callback repository, or
   compatibility shim.
5. Shared code requires shared semantics, ownership, and failure behavior.
6. Provider mapping and pagination belong to specialized adapters.
7. Composition roots may be hubs; they must not become universal service
   locators.
8. RepoWise and Graphify guide audits but do not define architecture.
9. A behavior correction requires focused regression coverage.
10. Every published block ends with global gates, SHA verification, and a clean
    tree.

## Current evidence and known limitations

At checkpoint `af32863317977e42ec59b712fc1f371b5f231cad`, the verified gates
reported 220 passing suites, 1373 passing tests, one skipped test, and passing
TypeScript, ESLint, build, production audit, and diff checks.

Current Graphify refresh:

```text
3271 nodes
8424 edges
217 communities
```

`docs.json` currently produces zero Graphify nodes. The generated graph is
undirected, so Graphify does not prove the absence of directed dependency
cycles; import analysis and architecture tests enforce direction. A successful
RepoWise safe dead-code run at this checkpoint reported zero findings,
unreachable files, and unused exports. That result is point-in-time evidence,
not permanent proof. RepoWise's highest rankings remain mainly churn/co-change
and duplicated-line suggestions; they are not automatic refactoring
instructions.

## Migration and retirement protocol

A facade, builder, or adapter may be removed or repartitioned only after:

1. all production callers are enumerated;
2. callers are classified by capability and lifecycle;
3. the semantic boundary and failure contract are explicit;
4. focused behavior and composition tests pass;
5. a zero-reference search confirms retirement;
6. architecture tests are updated;
7. global gates and graph refresh pass;
8. publication and remote SHA are verified.
