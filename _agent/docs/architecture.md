---
name: Architecture
description: Current architecture, runtime boundaries, and key source paths.
---

# Architecture and key paths

The authoritative architecture contract is [`../../docs/development/architecture.mdx`](../../docs/development/architecture.mdx), with executable rules in [`../../docs/dependency-rules.md`](../../docs/dependency-rules.md).

## Dependency direction

```text
entrypoint
  -> lifecycle/composition root
    -> application use case/workflow
      -> semantic application port
        -> specialized adapter
          -> provider client/detail
```

Application code must not import concrete repositories, manager adapters,
infrastructure, entrypoints, Octokit, or provider DTOs. `src/data/model/` and
`src/domain/` are the pure core; they may depend only on other pure policies
and standard TypeScript types.

## Runtime entrypoints

1. **GitHub Action:** `src/actions/github_action.ts` maps GitHub inputs/events,
   builds `Execution`, and enters the shared action lifecycle.
2. **Local action:** `src/actions/local_action.ts` maps local/config inputs,
   builds `Execution`, and renders local results.
3. **CLI:** `src/cli.ts` boots `src/cli/cli_program.ts` and command modules.
4. **Main routing:** `src/actions/common_action.ts` coordinates lifecycle
   concerns; `src/actions/main_run_dispatcher.ts` only logs and delegates to
   handlers supplied by `src/infrastructure/composition/`.

These lifecycles remain independent and share only provider-neutral contracts.

## Key paths

| Area | Path | Purpose |
|---|---|---|
| Domain/model policies | `src/domain/`, `src/data/model/` | provider-neutral rules and models |
| Application use cases | `src/application/usecases/` | orchestration and workflows |
| Application policies | `src/application/policies/` | deterministic decisions and mapping policies |
| Semantic ports | `src/application/ports/` | capability contracts |
| Specialized adapters | `src/data/repository/` | provider-facing capability implementations |
| GitHub transports | `src/infrastructure/github/` | Octokit/GraphQL adapters and client ports |
| Composition roots | `src/infrastructure/composition/` | dependency graph assembly |
| Runtime composition | `src/actions/` | GitHub/local lifecycle boundaries |
| Description adapter | `src/manager/description/` | issue-description persistence details |
| CLI commands | `src/cli/commands/` | parsing and command entry behavior |
| Architecture tests | `src/architecture/__tests__/`, `src/application/**/__tests__/` | executable dependency rules |

## Current design notes

- There is no universal repository, AI, or provider facade in production.
- `Execution` is the legacy-compatible runtime aggregate and remains a high-
  connectivity hub; new use cases should accept the narrowest context contract
  that their capability needs.
- Setup configuration is split into focused defaults, plan, validation, and
  storage policies. Resource provisioning is isolated from setup orchestration.
- Input keys, Bugbot constants, workflow statuses, image defaults, and CLI
  errors are owned by their consuming layer instead of a global constants file.
- Architecture tests verify cycle freedom, import resolution, pure-core
  isolation, application outer-layer isolation, and composition boundaries.

Always inspect current source and run the architecture tests; generated Graphify
topology and historical documents are navigation aids, not authority.
