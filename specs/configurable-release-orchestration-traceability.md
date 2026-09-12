# Configurable release orchestration traceability

This matrix accompanies
[`configurable-release-orchestration.md`](./configurable-release-orchestration.md).
Paths are repository-relative. Automated checks are deterministic and do not
call live providers. AC-40 and the human portion of AC-46 remain evidence gates
for the implementation pull request because source code cannot establish visual
readability in GitHub's desktop/mobile and light/dark renderers.

Implementation landed in `df972490`. The 2026-09-10 documentation follow-up
reconciles the public lifecycle, setup, npm OIDC, configuration, recovery, and
single-action contracts and adds executable parity checks.
The specification remains in live-validation state until AC-40 and the human
portion of AC-46 have reviewed screenshots and the ten-second comprehension
result from a real end-to-end operation.

A 2026-09-11 architecture audit identified a separate concurrency conformance
gap: the current state test simulates a changed phase but does not admit two
simultaneous invocations, and not every mutation workflow shares one
operation-scoped concurrency group.
[`deployment-concurrency-and-state-fencing.md`](./deployment-concurrency-and-state-fencing.md)
owns the exact P0-B implementation contract, while
[`architecture-quality-and-scalability-hardening.md`](./architecture-quality-and-scalability-hardening.md)
owns cross-priority sequencing. Rows below distinguish replay evidence already
present from the pending exclusive-admission proof.

## Test-budget ledger

The feature floor is allocated without double-counting cases:

| Area | Required | Assigned evidence |
|---|---:|---|
| Domain/configuration/planning | 18 | First 18 distinct rows in `deployment_configuration.test.ts`; additional planning cases are surplus. |
| State/idempotent orchestration | 18 | First 18 cases in `deployment_orchestration_use_case.test.ts`; domain transition cases are surplus. |
| GitHub/repository adapters | 12 | First 12 cases in `github_deployment_repository.test.ts`; state, release, and tag adapter cases are surplus. |
| Workflow/setup contracts | 8 | Gate-first DAG, continuation, merge-group, operation identity, OIDC, PAT, polling, and failure-projection cases in `validate_workflow_contract.test.ts`. |
| UI/localization/sanitization | 10 | First 10 cases in `deployment_presentation_policy.test.ts`; lifecycle and Job Summary cases are surplus. |
| Integration/replay/security | 6 | Stale-state simulation, forged marker, cross-repository event, duplicate event, cancellation recovery, and cleanup replay cases in `deployment_orchestration_use_case.test.ts`; simultaneous exclusive admission remains a P0-B delta. |
| **Total assigned** | **72** | The implementation adds substantially more cases than the non-overlapping floor. |

Repository-wide coverage thresholds remain in `jest.config.js`; architecture,
workflow, documentation, type, lint, package, build, and Graphify checks are
separate gates.

## Acceptance criteria

| AC | Implementation | Automated evidence | User/operator documentation | Status |
|---:|---|---|---|---|
| 1 | `prepare_release_branch.ts`, schema-v3 origin fields | linked-branch, plan, orchestration tests | `/issues/deployment-orchestration` | Automated |
| 2 | Immutable `sourceSha`; promotion verifies the exact prepared head | plan and orchestration stale-head tests | `/issues/deployment-orchestration` | Automated |
| 3 | Release preparation jobs commit version/build output before promotion | workflow contract and release repository tests | `/issues/type/release` | Automated |
| 4 | Prepare/publish workflow modes and guarded publication actions | workflow and continuation-guard tests | `/issues/deployment-orchestration` | Automated |
| 5 | `createOrVerifyTagAtSha(productionSha)` | tag repository and orchestration tests | `/development/release-process` | Automated |
| 6 | Event-driven PR completion with no check polling | workflow and use-case tests | `/issues/deployment-orchestration` | Automated |
| 7 | Deterministic sync branch created from target SHA | plan, adapter, and use-case strict-target tests | `/issues/deployment-orchestration` | Automated |
| 8 | `selectBackmergeMode` and server-side sync merge | plan and orchestration tests | `/issues/deployment-orchestration` | Automated |
| 9 | Direct mode for compatible targets | plan tests | `/issues/deployment-orchestration` | Automated |
| 10 | Managed merged-PR wake-up and publication dispatch | orchestration and workflow tests | `/issues/deployment-orchestration` | Automated |
| 11 | Closed-unmerged promotion blocks before publication | orchestration tests | recovery decision tree | Automated |
| 12 | Closed-unmerged reconciliation blocks; cleanup is deferred | orchestration replay tests | recovery decision tree | Automated |
| 13 | Phase-aware duplicate event no-ops | replay is automated; deterministic simultaneous admission and shared workflow serialization are pending under P0-B | recovery decision tree | **Hardening pending** |
| 14 | Retryable publication block and immutable tag reuse | continuation-guard, tag, and workflow tests | recovery decision tree | Automated |
| 15 | Registry detection skips an exact visible version and verifies its `gitHead` against production | parsed workflow contract tests | `/development/release-process` | Automated |
| 16 | Conflicting immutable tag throws and is never moved | tag repository tests | recovery decision tree | Automated |
| 17 | GitHub Release create-or-reuse on `422` | release repository tests | `/issues/deployment-orchestration` | Automated |
| 18 | Pure label projection is idempotent | lifecycle policy and orchestration tests | `/issues/deployment-orchestration` | Automated |
| 19 | Operation snapshots branch roles and strategies | plan/state tests | configuration reference | Automated |
| 20 | `reconciliationSource` selects frozen source head | plan tests | configuration reference | Automated |
| 21 | `reconciliationSource` selects accepted production SHA | plan tests | configuration reference | Automated |
| 22 | Hotfix target-selection policy: prefer/development/both | plan and orchestration tests | hotfix lifecycle | Automated |
| 23 | Multiple active releases block `prefer-release` | plan and orchestration tests | hotfix lifecycle | Automated |
| 24 | Manual strategy creates no target and keeps issue open | configuration, plan, and orchestration tests | configuration reference | Automated |
| 25 | Cleanup/issue-completion enums and retryable cleanup | configuration, lifecycle, and replay tests | configuration reference | Automated |
| 26 | Dedicated PAT-backed completion workflow bypasses generic bot gate only for marked PRs | workflow contract tests | repository setup | Automated |
| 27 | Operation/version guard, marker, repository, branches, and SHA verification | guard, marker, adapter, and use-case security tests | trust/recovery sections | Automated |
| 28 | Boundary and setup validation for enums/invalid combinations | configuration and setup-policy tests | configuration reference | Automated |
| 29 | `environment: npm`; job-local `id-token: write`; no npm token | workflow contract tests | npm trusted publishing section | Automated |
| 30 | Provider-neutral app/domain; Octokit DTOs remain infrastructure-only | architecture boundary tests | `/development/architecture` | Automated |
| 31 | Stable operation-scoped dashboard find/update and duplicate detection | presentation repository, renderer, and replay tests | What maintainers see | Automated |
| 32 | Guided/compact/quiet policies retain actionable states | presentation tests | What maintainers see | Automated |
| 33 | Fixed-label Mermaid plus textual fallback; untrusted values excluded | presentation tests | What maintainers see | Automated |
| 34 | Typed `en-US`/`es-ES` catalog and safe fallback | presentation tests | What maintainers see | Automated |
| 35 | Deterministic ordered promotion/reconciliation PR renderers | presentation tests | release/hotfix lifecycle | Automated |
| 36 | Blocked fact table and already-public reconciliation notice | presentation tests | recovery decision tree | Automated |
| 37 | Descriptive issue, PR, compare, commit, branch, tag, release, npm, major-tag, and run links | presentation link tests | What maintainers see | Automated |
| 38 | Publication verification replaces `deploy` with `deployed`; lifecycle continues as reviewing | lifecycle and orchestration tests | What maintainers see | Automated |
| 39 | One dashboard; stable milestone markers; maximum four named milestones in policy | presentation repository and orchestration tests | What maintainers see | Automated |
| 40 | GitHub desktop/mobile, light/dark, Mermaid/fallback review | Renderer tests provide deterministic fixtures; real GitHub screenshots belong in the implementation PR | UX acceptance section of SDD | **Manual PR gate** |
| 41 | Persisted messages and rendered values sanitize mentions, commands, HTML/markers, headings, and Mermaid inputs | domain and presentation security tests | trust section | Automated |
| 42 | Dedicated Job Summary distinguishes external wait from workflow failure | presentation and Action completion tests | What maintainers see | Automated |
| 43 | Route/anchors registered; Action inputs and every single-action value verified; workflow catalog/examples parsed; embedded issue templates synchronized; high-risk defaults and prerequisites asserted | documentation and workflow validators | all linked pages | Automated |
| 44 | Narrow context, provider-neutral ports, mutation-free presentation, acyclic graph | provider/cycle boundaries are automated; deployment handler context closure is pending under P0-B/P2 | `/development/architecture` | **Hardening pending** |
| 45 | Non-overlapping 72-case ledger plus repository coverage gate | this ledger and Jest coverage | `/development/testing` | Automated |
| 46 | Ten-second comprehension: kind, phase, publication, transition, and action | semantic renderer assertions; final comprehension judgment belongs in PR review | What maintainers see | **Automated semantics + manual PR gate** |

## Implementation surfaces

- Domain: `src/domain/deployment_configuration.ts`,
  `src/domain/deployment_operation.ts`, and `src/domain/managed_pull_request.ts`.
- Application: deployment planning, continuation guard, lifecycle, presentation,
  orchestration use case, and semantic ports under `src/application/`.
- Adapters: `src/data/repository/deployment/`, release/tag repositories, and
  `src/infrastructure/github/octokit_deployment_adapter.ts`.
- Entrypoints: `action.yml`, execution builders, single-action routing, active
  workflows, and setup workflow templates.
- UX: the issue control center, managed PR bodies, bounded milestone comments,
  and the deployment-specific Job Summary.
