---
name: Architecture
description: Current architecture, runtime boundaries, and key source paths.
---

# Architecture and key paths

This is a compact contributor guide for the current checkout. The authoritative
architecture contract is [`../../docs/repository-architecture.md`](../../docs/repository-architecture.md),
with the capability inventory in
[`../../docs/capability-map.md`](../../docs/capability-map.md).

## Dependency direction

```text
entrypoint
  -> lifecycle/capability composition
    -> application use case/workflow
      -> semantic port
        -> specialized adapter
          -> provider client/detail
```

Application code must not import concrete repositories, manager adapters,
infrastructure, entrypoints, Octokit, or provider DTOs.

## Runtime entrypoints

1. **GitHub Action:** `src/actions/github_action.ts` maps GitHub inputs/events,
   builds `Execution`, and enters the shared action lifecycle.
2. **Local action:** `src/actions/local_action.ts` builds local configuration and
   execution, invokes `mainRun`, and renders local results.
3. **CLI:** `src/cli.ts` is a small bootstrap for `src/cli/cli_program.ts` and
   command modules under `src/cli/commands/`.
4. **Main routing:** `src/actions/common_action.ts` and
   `src/actions/main_run_dispatcher.ts` select issue, pull-request, comment,
   push, and single-action workflows.

These lifecycles are intentionally independent.

## Key paths

| Area | Path | Purpose |
|---|---|---|
| Application use cases | `src/application/usecases/` | workflows and orchestration |
| Semantic ports | `src/application/ports/` | capability contracts |
| Domain/model policies | `src/data/model/` | models and pure policies |
| Specialized adapters | `src/data/repository/` | provider-facing capability implementations |
| GitHub transports | `src/infrastructure/github/` | Octokit/GraphQL adapters and client ports |
| Composition roots | `src/infrastructure/composition/` | capability/use-case graph assembly |
| Runtime composition | `src/actions/` | GitHub/local lifecycle and route-specific wiring |
| Description/configuration adapter | `src/manager/description/` | issue-description persistence details |
| CLI commands | `src/cli/commands/` | parsing and command-specific entry behavior |
| Architecture tests | `src/application/__tests__/`, `src/actions/__tests__/`, `src/infrastructure/**/__tests__/` | executable dependency rules |

## Current architecture notes

- There is no current universal `RepositoryFactory`, `AiRepository`,
  `IssueRepository`, `PullRequestRepository`, `ProjectBoardRepository`, or
  `OrganizationRepository` production facade.
- Project board query, link, and command capabilities share only the query
  contract required by composition.
- Organization membership, authenticated identity, and actor authorization are
  separate ports/adapters.
- Pull-request changes, review, threads, and lifecycle remain separate.
- `ConfigurationHandler` is an outer adapter behind application configuration
  ports.
- Concrete route wiring still exists in `main_run_dispatcher.ts`; Phase D audits
  whether that is the correct lifecycle boundary before moving any code.
- A verified import SCC is the next production priority: `Execution` initiates
  release/hotfix resolution through model helpers, those helpers construct
  application use cases, and those use cases import `Execution`;
  `ExecutionConfigurationPort` and `Execution` also import each other. Remove
  this through application-owned orchestration and an executable boundary guard
  before continuing release/tag adapter hardening.

Never infer current architecture from historical plans without checking the
source and the authoritative documents.
