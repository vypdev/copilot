# Product capability specification catalog

> Generated from [`catalog.json`](./catalog.json). Do not edit this table by hand.
> Run `pnpm run generate:specifications` after changing catalog metadata.

This catalog answers which product contract owns a capability and where its
implementation, verification, workflow, and user-documentation evidence lives.
An **As-built baseline** records verified current behavior; it does not hide known
debt or convert unknown historic intent into a design decision.

| Capability ID | Status | Scope | Primary SDD | Evidence |
|---|---|---|---|---|
| `release-orchestration` | Implemented | Release and hotfix promotion, publication, reconciliation, and durable recovery | [Configurable production-first release orchestration](./configurable-release-orchestration.md) + 1 companion | 18 paths · 2026-09-11 |
| `merge-queue-readiness` | Implemented | Fail-closed validation of required checks and merge-group workflow support | [Merge queue readiness and effective target rules](./merge-queue-readiness.md) | 13 paths · 2026-09-11 |
| `bugbot-review-state-reconciliation` | Implemented | Reconcile review snapshots, findings, threads, comments, and check conclusions | [Bugbot review-state reconciliation](./bugbot-review-state-reconciliation.md) | 13 paths · 2026-09-11 |
| `execution-lifecycle` | As-built baseline | Shared GitHub Action lifecycle from event admission through durable user-facing results | [Execution admission, queueing, routing, and result publication](./execution-admission-queue-and-publication.md) | 20 paths · 2026-09-11 |
| `setup-and-doctor` | As-built baseline | Plan, validate, provision, and audit a repository installation without exposing credentials | [Setup, configuration, credentials, and doctor](./setup-configuration-credentials-and-doctor.md) | 19 paths · 2026-09-11 |
| `managed-issue-lifecycle` | As-built baseline | Convert typed issues into traceable work branches, project state, and lifecycle state | [Managed issue and branch lifecycle](./managed-issue-and-branch-lifecycle.md) | 17 paths · 2026-09-11 |
| `comment-automation` | As-built baseline | Route explicit commands and mentioned natural language while protecting repository mutations | [Comment automation and authorization](./comment-automation-and-authorization.md) | 16 paths · 2026-09-11 |
| `bugbot-analysis-and-autofix` | As-built baseline | Analyze bounded change ranges, publish stable findings, and apply authorized verified fixes | [Bugbot analysis, finding publication, and autofix](./bugbot-analysis-publication-and-autofix.md) | 20 paths · 2026-09-11 |
| `branch-synchronization` | As-built baseline | Observe parent drift and safely merge a parent branch into a linked working branch | [Branch synchronization and conflict recovery](./branch-synchronization-and-conflict-recovery.md) | 15 paths · 2026-09-11 |
| `pull-request-lifecycle` | As-built baseline | Link pull requests to issues and projects, synchronize metadata, reviewers, size, and descriptions | [Pull request lifecycle and enrichment](./pull-request-lifecycle-and-enrichment.md) | 13 paths · 2026-09-11 |
| `agent-runtime` | As-built baseline | Resolve, provision, authenticate, authorize, and execute only the agent roles reachable by a run | [Agent runtime, provider, model, and role routing](./agent-runtime-provider-and-model-routing.md) | 20 paths · 2026-09-11 |
| `cli-and-single-actions` | As-built baseline | Expose bounded local commands and workflow-dispatched operations through the shared application core | [CLI and single-action execution](./cli-and-single-action-execution.md) | 17 paths · 2026-09-11 |

## Evidence map

### `release-orchestration` — Configurable production-first release orchestration

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/configurable-release-orchestration.md`](./configurable-release-orchestration.md) · [`specs/configurable-release-orchestration-traceability.md`](./configurable-release-orchestration-traceability.md)
- Workflows: [`.github/workflows/release_workflow.yml`](../.github/workflows/release_workflow.yml) · [`.github/workflows/hotfix_workflow.yml`](../.github/workflows/hotfix_workflow.yml) · [`.github/workflows/copilot_deployment_orchestration.yml`](../.github/workflows/copilot_deployment_orchestration.yml) · [`setup/workflows/release_workflow.yml`](../setup/workflows/release_workflow.yml) · [`setup/workflows/hotfix_workflow.yml`](../setup/workflows/hotfix_workflow.yml) · [`setup/workflows/copilot_deployment_orchestration.yml`](../setup/workflows/copilot_deployment_orchestration.yml)
- Entrypoints: [`src/application/usecases/actions/deployment_orchestration_use_case.ts`](../src/application/usecases/actions/deployment_orchestration_use_case.ts)
- Core code: [`src/domain/deployment_configuration.ts`](../src/domain/deployment_configuration.ts) · [`src/domain/deployment_operation.ts`](../src/domain/deployment_operation.ts) · [`src/application/policies/deployment_lifecycle_policy.ts`](../src/application/policies/deployment_lifecycle_policy.ts) · [`src/application/policies/deployment_plan_policy.ts`](../src/application/policies/deployment_plan_policy.ts) · [`src/infrastructure/github/octokit_deployment_adapter.ts`](../src/infrastructure/github/octokit_deployment_adapter.ts)
- Tests: [`src/domain/__tests__/deployment_operation.test.ts`](../src/domain/__tests__/deployment_operation.test.ts) · [`src/application/usecases/actions/__tests__/deployment_orchestration_use_case.test.ts`](../src/application/usecases/actions/__tests__/deployment_orchestration_use_case.test.ts)
- User documentation: [`docs/issues/deployment-orchestration.mdx`](../docs/issues/deployment-orchestration.mdx) · [`docs/issues/type/release.mdx`](../docs/issues/type/release.mdx) · [`docs/issues/type/hotfix.mdx`](../docs/issues/type/hotfix.mdx) · [`docs/development/release-process.mdx`](../docs/development/release-process.mdx)

### `merge-queue-readiness` — Merge queue readiness and effective target rules

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/merge-queue-readiness.md`](./merge-queue-readiness.md)
- Workflows: [`.github/workflows/ci_check.yml`](../.github/workflows/ci_check.yml) · [`.github/workflows/repowise.yml`](../.github/workflows/repowise.yml) · [`.github/workflows/copilot_pull_request.yml`](../.github/workflows/copilot_pull_request.yml) · [`.github/workflows/copilot_deployment_orchestration.yml`](../.github/workflows/copilot_deployment_orchestration.yml)
- Entrypoints: [`src/application/usecases/setup/merge_queue_readiness_use_case.ts`](../src/application/usecases/setup/merge_queue_readiness_use_case.ts)
- Core code: [`src/domain/merge_queue_readiness.ts`](../src/domain/merge_queue_readiness.ts) · [`src/infrastructure/github/octokit_checks_adapters.ts`](../src/infrastructure/github/octokit_checks_adapters.ts) · [`scripts/validate-workflow-contract.cjs`](../scripts/validate-workflow-contract.cjs)
- Tests: [`src/domain/__tests__/merge_queue_readiness.test.ts`](../src/domain/__tests__/merge_queue_readiness.test.ts) · [`src/application/usecases/setup/__tests__/merge_queue_readiness_use_case.test.ts`](../src/application/usecases/setup/__tests__/merge_queue_readiness_use_case.test.ts) · [`src/tooling/__tests__/validate_workflow_contract.test.ts`](../src/tooling/__tests__/validate_workflow_contract.test.ts)
- User documentation: [`docs/issues/deployment-orchestration.mdx`](../docs/issues/deployment-orchestration.mdx) · [`docs/security-operations/operations/verification.mdx`](../docs/security-operations/operations/verification.mdx)

### `bugbot-review-state-reconciliation` — Bugbot review-state reconciliation

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/bugbot-review-state-reconciliation.md`](./bugbot-review-state-reconciliation.md)
- Workflows: [`.github/workflows/copilot_pull_request.yml`](../.github/workflows/copilot_pull_request.yml) · [`.github/workflows/copilot_pull_request_comment.yml`](../.github/workflows/copilot_pull_request_comment.yml)
- Entrypoints: [`src/application/usecases/steps/commit/bugbot/reconcile_bugbot_review_state_use_case.ts`](../src/application/usecases/steps/commit/bugbot/reconcile_bugbot_review_state_use_case.ts)
- Core code: [`src/domain/bugbot/review_state.ts`](../src/domain/bugbot/review_state.ts) · [`src/domain/bugbot/review_projection.ts`](../src/domain/bugbot/review_projection.ts) · [`src/application/policies/bugbot_reconciliation_policy.ts`](../src/application/policies/bugbot_reconciliation_policy.ts) · [`src/application/usecases/steps/commit/bugbot/synchronize_bugbot_review_presentation_use_case.ts`](../src/application/usecases/steps/commit/bugbot/synchronize_bugbot_review_presentation_use_case.ts)
- Tests: [`src/domain/bugbot/__tests__/review_state.test.ts`](../src/domain/bugbot/__tests__/review_state.test.ts) · [`src/domain/bugbot/__tests__/review_projection.test.ts`](../src/domain/bugbot/__tests__/review_projection.test.ts) · [`src/application/usecases/steps/commit/bugbot/__tests__/reconcile_bugbot_review_state_integration.test.ts`](../src/application/usecases/steps/commit/bugbot/__tests__/reconcile_bugbot_review_state_integration.test.ts)
- User documentation: [`docs/bugbot/detection.mdx`](../docs/bugbot/detection.mdx) · [`docs/bugbot/finding-publication.mdx`](../docs/bugbot/finding-publication.mdx) · [`docs/bugbot/quality-observability.mdx`](../docs/bugbot/quality-observability.mdx)

### `execution-lifecycle` — Execution admission, queueing, routing, and result publication

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/execution-admission-queue-and-publication.md`](./execution-admission-queue-and-publication.md)
- Workflows: [`.github/workflows/copilot_issue.yml`](../.github/workflows/copilot_issue.yml) · [`.github/workflows/copilot_issue_comment.yml`](../.github/workflows/copilot_issue_comment.yml) · [`.github/workflows/copilot_pull_request.yml`](../.github/workflows/copilot_pull_request.yml) · [`.github/workflows/copilot_pull_request_comment.yml`](../.github/workflows/copilot_pull_request_comment.yml) · [`.github/workflows/copilot_commit.yml`](../.github/workflows/copilot_commit.yml)
- Entrypoints: [`src/actions/github_action.ts`](../src/actions/github_action.ts) · [`src/actions/common_action.ts`](../src/actions/common_action.ts)
- Core code: [`src/actions/main_run_lifecycle.ts`](../src/actions/main_run_lifecycle.ts) · [`src/actions/main_run_route.ts`](../src/actions/main_run_route.ts) · [`src/actions/github_action_completion.ts`](../src/actions/github_action_completion.ts) · [`src/application/policies/github_execution_admission_policy.ts`](../src/application/policies/github_execution_admission_policy.ts) · [`src/application/policies/workflow_queue_policy.ts`](../src/application/policies/workflow_queue_policy.ts) · [`src/application/policies/result_publication_policy.ts`](../src/application/policies/result_publication_policy.ts)
- Tests: [`src/actions/__tests__/github_action.test.ts`](../src/actions/__tests__/github_action.test.ts) · [`src/actions/__tests__/github_action_completion.test.ts`](../src/actions/__tests__/github_action_completion.test.ts) · [`src/application/usecases/execution/__tests__/resolve_github_execution_admission_use_case.test.ts`](../src/application/usecases/execution/__tests__/resolve_github_execution_admission_use_case.test.ts) · [`src/application/usecases/workflow/__tests__/wait_for_previous_workflow_runs_use_case.test.ts`](../src/application/usecases/workflow/__tests__/wait_for_previous_workflow_runs_use_case.test.ts)
- User documentation: [`docs/overview.mdx`](../docs/overview.mdx) · [`docs/security-operations/operations/troubleshooting.mdx`](../docs/security-operations/operations/troubleshooting.mdx) · [`docs/development/architecture.mdx`](../docs/development/architecture.mdx)

### `setup-and-doctor` — Setup, configuration, credentials, and doctor

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/setup-configuration-credentials-and-doctor.md`](./setup-configuration-credentials-and-doctor.md)
- Workflows: [`setup/workflows/agent-cli-provisioning.yml`](../setup/workflows/agent-cli-provisioning.yml) · [`setup/workflows/copilot_credential_health.yml`](../setup/workflows/copilot_credential_health.yml)
- Entrypoints: [`src/cli/commands/setup.ts`](../src/cli/commands/setup.ts) · [`src/cli/commands/doctor.ts`](../src/cli/commands/doctor.ts)
- Core code: [`src/domain/setup.ts`](../src/domain/setup.ts) · [`src/application/usecases/setup/setup_wizard_use_case.ts`](../src/application/usecases/setup/setup_wizard_use_case.ts) · [`src/application/usecases/setup/setup_credentials_use_case.ts`](../src/application/usecases/setup/setup_credentials_use_case.ts) · [`src/application/usecases/setup/doctor_use_case.ts`](../src/application/usecases/setup/doctor_use_case.ts) · [`src/application/policies/setup_configuration_validation.ts`](../src/application/policies/setup_configuration_validation.ts) · [`src/infrastructure/setup_workspace_adapter.ts`](../src/infrastructure/setup_workspace_adapter.ts)
- Tests: [`src/application/usecases/setup/__tests__/setup_wizard_use_case.test.ts`](../src/application/usecases/setup/__tests__/setup_wizard_use_case.test.ts) · [`src/application/usecases/setup/__tests__/setup_credentials_use_case.test.ts`](../src/application/usecases/setup/__tests__/setup_credentials_use_case.test.ts) · [`src/application/usecases/setup/__tests__/doctor_use_case.test.ts`](../src/application/usecases/setup/__tests__/doctor_use_case.test.ts) · [`src/infrastructure/__tests__/setup_workspace_adapter.test.ts`](../src/infrastructure/__tests__/setup_workspace_adapter.test.ts)
- User documentation: [`docs/how-to-use.mdx`](../docs/how-to-use.mdx) · [`docs/configuration-checklist.mdx`](../docs/configuration-checklist.mdx) · [`docs/security-operations/operations/provisioning.mdx`](../docs/security-operations/operations/provisioning.mdx) · [`docs/security-operations/security/credentials.mdx`](../docs/security-operations/security/credentials.mdx) · [`docs/single-actions/workflow-and-cli.mdx`](../docs/single-actions/workflow-and-cli.mdx)

### `managed-issue-lifecycle` — Managed issue and branch lifecycle

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/managed-issue-and-branch-lifecycle.md`](./managed-issue-and-branch-lifecycle.md)
- Workflows: [`.github/workflows/copilot_issue.yml`](../.github/workflows/copilot_issue.yml) · [`.github/workflows/copilot_commit.yml`](../.github/workflows/copilot_commit.yml)
- Entrypoints: [`src/application/usecases/issue_use_case.ts`](../src/application/usecases/issue_use_case.ts) · [`src/application/usecases/commit_use_case.ts`](../src/application/usecases/commit_use_case.ts)
- Core code: [`src/application/usecases/issue_workflow.ts`](../src/application/usecases/issue_workflow.ts) · [`src/application/usecases/steps/issue/branch_preparation_strategy.ts`](../src/application/usecases/steps/issue/branch_preparation_strategy.ts) · [`src/application/usecases/steps/issue/prepare_branches_use_case.ts`](../src/application/usecases/steps/issue/prepare_branches_use_case.ts) · [`src/data/repository/branch_lifecycle_repository.ts`](../src/data/repository/branch_lifecycle_repository.ts) · [`src/domain/copilot_lifecycle.ts`](../src/domain/copilot_lifecycle.ts)
- Tests: [`src/application/usecases/__tests__/issue_use_case.test.ts`](../src/application/usecases/__tests__/issue_use_case.test.ts) · [`src/application/usecases/steps/issue/__tests__/prepare_branches_use_case.test.ts`](../src/application/usecases/steps/issue/__tests__/prepare_branches_use_case.test.ts) · [`src/data/repository/__tests__/branch_lifecycle_repository.test.ts`](../src/data/repository/__tests__/branch_lifecycle_repository.test.ts) · [`src/domain/__tests__/copilot_lifecycle.test.ts`](../src/domain/__tests__/copilot_lifecycle.test.ts)
- User documentation: [`docs/issues/branch-management.mdx`](../docs/issues/branch-management.mdx) · [`docs/issues/labels-and-branch-types.mdx`](../docs/issues/labels-and-branch-types.mdx) · [`docs/issues/assignees-and-projects.mdx`](../docs/issues/assignees-and-projects.mdx) · [`docs/issues/notifications-and-auto-close.mdx`](../docs/issues/notifications-and-auto-close.mdx)

### `comment-automation` — Comment automation and authorization

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/comment-automation-and-authorization.md`](./comment-automation-and-authorization.md)
- Workflows: [`.github/workflows/copilot_issue_comment.yml`](../.github/workflows/copilot_issue_comment.yml) · [`.github/workflows/copilot_pull_request_comment.yml`](../.github/workflows/copilot_pull_request_comment.yml)
- Entrypoints: [`src/application/usecases/issue_comment_use_case.ts`](../src/application/usecases/issue_comment_use_case.ts) · [`src/application/usecases/pull_request_review_comment_use_case.ts`](../src/application/usecases/pull_request_review_comment_use_case.ts)
- Core code: [`src/domain/copilot_command.ts`](../src/domain/copilot_command.ts) · [`src/application/usecases/comment_automation_use_case.ts`](../src/application/usecases/comment_automation_use_case.ts) · [`src/application/usecases/comment_automation_route_policy.ts`](../src/application/usecases/comment_automation_route_policy.ts) · [`src/application/usecases/comment_automation_command_workflow.ts`](../src/application/usecases/comment_automation_command_workflow.ts) · [`src/data/repository/organization/actor_authorization_repository.ts`](../src/data/repository/organization/actor_authorization_repository.ts)
- Tests: [`src/domain/__tests__/copilot_command.test.ts`](../src/domain/__tests__/copilot_command.test.ts) · [`src/application/usecases/__tests__/issue_comment_use_case.test.ts`](../src/application/usecases/__tests__/issue_comment_use_case.test.ts) · [`src/application/usecases/__tests__/pull_request_review_comment_use_case.test.ts`](../src/application/usecases/__tests__/pull_request_review_comment_use_case.test.ts) · [`src/data/repository/organization/__tests__/actor_authorization_repository.test.ts`](../src/data/repository/organization/__tests__/actor_authorization_repository.test.ts)
- User documentation: [`docs/issues/comment-commands.mdx`](../docs/issues/comment-commands.mdx) · [`docs/bugbot/do-user-request.mdx`](../docs/bugbot/do-user-request.mdx) · [`docs/bugbot/permissions.mdx`](../docs/bugbot/permissions.mdx)

### `bugbot-analysis-and-autofix` — Bugbot analysis, finding publication, and autofix

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/bugbot-analysis-publication-and-autofix.md`](./bugbot-analysis-publication-and-autofix.md)
- Workflows: [`.github/workflows/copilot_commit.yml`](../.github/workflows/copilot_commit.yml) · [`.github/workflows/copilot_pull_request.yml`](../.github/workflows/copilot_pull_request.yml) · [`.github/workflows/copilot_pull_request_comment.yml`](../.github/workflows/copilot_pull_request_comment.yml)
- Entrypoints: [`src/application/usecases/steps/commit/detect_potential_problems_use_case.ts`](../src/application/usecases/steps/commit/detect_potential_problems_use_case.ts) · [`src/application/usecases/steps/commit/bugbot/bugbot_autofix_use_case.ts`](../src/application/usecases/steps/commit/bugbot/bugbot_autofix_use_case.ts)
- Core code: [`src/domain/bugbot/finding.ts`](../src/domain/bugbot/finding.ts) · [`src/domain/bugbot/finding_identity.ts`](../src/domain/bugbot/finding_identity.ts) · [`src/domain/bugbot/review_configuration.ts`](../src/domain/bugbot/review_configuration.ts) · [`src/application/usecases/steps/commit/bugbot/publish_findings_use_case.ts`](../src/application/usecases/steps/commit/bugbot/publish_findings_use_case.ts) · [`src/application/usecases/steps/commit/workspace_mutation_guard.ts`](../src/application/usecases/steps/commit/workspace_mutation_guard.ts) · [`src/infrastructure/composition/bugbot_composition_root.ts`](../src/infrastructure/composition/bugbot_composition_root.ts)
- Tests: [`src/application/usecases/steps/commit/__tests__/bugbot_review_lifecycle.e2e.test.ts`](../src/application/usecases/steps/commit/__tests__/bugbot_review_lifecycle.e2e.test.ts) · [`src/application/usecases/steps/commit/bugbot/__tests__/publish_findings_use_case.test.ts`](../src/application/usecases/steps/commit/bugbot/__tests__/publish_findings_use_case.test.ts) · [`src/application/usecases/steps/commit/bugbot/__tests__/bugbot_autofix_use_case.test.ts`](../src/application/usecases/steps/commit/bugbot/__tests__/bugbot_autofix_use_case.test.ts) · [`src/domain/bugbot/__tests__/finding_identity.test.ts`](../src/domain/bugbot/__tests__/finding_identity.test.ts)
- User documentation: [`docs/bugbot/how-it-works.mdx`](../docs/bugbot/how-it-works.mdx) · [`docs/bugbot/detection.mdx`](../docs/bugbot/detection.mdx) · [`docs/bugbot/finding-publication.mdx`](../docs/bugbot/finding-publication.mdx) · [`docs/bugbot/autofix.mdx`](../docs/bugbot/autofix.mdx) · [`docs/bugbot/failure-scenarios.mdx`](../docs/bugbot/failure-scenarios.mdx)

### `branch-synchronization` — Branch synchronization and conflict recovery

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/branch-synchronization-and-conflict-recovery.md`](./branch-synchronization-and-conflict-recovery.md)
- Workflows: [`.github/workflows/copilot_branch_sync.yml`](../.github/workflows/copilot_branch_sync.yml) · [`setup/workflows/copilot_branch_sync.yml`](../setup/workflows/copilot_branch_sync.yml)
- Entrypoints: [`src/application/usecases/branch_sync/sync_branch_use_case.ts`](../src/application/usecases/branch_sync/sync_branch_use_case.ts) · [`src/application/usecases/actions/observe_branch_sync_use_case.ts`](../src/application/usecases/actions/observe_branch_sync_use_case.ts)
- Core code: [`src/domain/branch_sync_command.ts`](../src/domain/branch_sync_command.ts) · [`src/application/usecases/branch_sync/branch_sync_execution_policy.ts`](../src/application/usecases/branch_sync/branch_sync_execution_policy.ts) · [`src/data/repository/branch_sync/branch_dependency_policy.ts`](../src/data/repository/branch_sync/branch_dependency_policy.ts) · [`src/data/repository/branch_sync/branch_dependency_repository.ts`](../src/data/repository/branch_sync/branch_dependency_repository.ts) · [`src/infrastructure/branch_sync_workspace_adapter.ts`](../src/infrastructure/branch_sync_workspace_adapter.ts)
- Tests: [`src/application/usecases/branch_sync/__tests__/sync_branch_use_case.test.ts`](../src/application/usecases/branch_sync/__tests__/sync_branch_use_case.test.ts) · [`src/data/repository/branch_sync/__tests__/branch_dependency_policy.test.ts`](../src/data/repository/branch_sync/__tests__/branch_dependency_policy.test.ts) · [`src/data/repository/branch_sync/__tests__/branch_dependency_repository.test.ts`](../src/data/repository/branch_sync/__tests__/branch_dependency_repository.test.ts) · [`src/infrastructure/__tests__/branch_sync_workspace_adapter.test.ts`](../src/infrastructure/__tests__/branch_sync_workspace_adapter.test.ts)
- User documentation: [`docs/issues/branch-synchronization.mdx`](../docs/issues/branch-synchronization.mdx) · [`docs/issues/comment-commands.mdx`](../docs/issues/comment-commands.mdx)

### `pull-request-lifecycle` — Pull request lifecycle and enrichment

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/pull-request-lifecycle-and-enrichment.md`](./pull-request-lifecycle-and-enrichment.md)
- Workflows: [`.github/workflows/copilot_pull_request.yml`](../.github/workflows/copilot_pull_request.yml)
- Entrypoints: [`src/application/usecases/pull_request_use_case.ts`](../src/application/usecases/pull_request_use_case.ts)
- Core code: [`src/application/usecases/pull_request_workflow.ts`](../src/application/usecases/pull_request_workflow.ts) · [`src/application/usecases/pull_request_workflow_steps.ts`](../src/application/usecases/pull_request_workflow_steps.ts) · [`src/application/usecases/steps/pull_request/update_pull_request_description_use_case.ts`](../src/application/usecases/steps/pull_request/update_pull_request_description_use_case.ts) · [`src/domain/pull_request_description.ts`](../src/domain/pull_request_description.ts) · [`src/data/repository/pull_request/pull_request_lifecycle_repository.ts`](../src/data/repository/pull_request/pull_request_lifecycle_repository.ts)
- Tests: [`src/application/usecases/__tests__/pull_request_use_case.test.ts`](../src/application/usecases/__tests__/pull_request_use_case.test.ts) · [`src/application/usecases/steps/pull_request/__tests__/update_pull_request_description_use_case.test.ts`](../src/application/usecases/steps/pull_request/__tests__/update_pull_request_description_use_case.test.ts) · [`src/data/repository/__tests__/pull_request_lifecycle_repository.test.ts`](../src/data/repository/__tests__/pull_request_lifecycle_repository.test.ts)
- User documentation: [`docs/pull-requests/capabilities.mdx`](../docs/pull-requests/capabilities.mdx) · [`docs/pull-requests/ai-description.mdx`](../docs/pull-requests/ai-description.mdx) · [`docs/pull-requests/configuration.mdx`](../docs/pull-requests/configuration.mdx)

### `agent-runtime` — Agent runtime, provider, model, and role routing

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/agent-runtime-provider-and-model-routing.md`](./agent-runtime-provider-and-model-routing.md)
- Workflows: [`setup/workflows/agent-cli-provisioning.yml`](../setup/workflows/agent-cli-provisioning.yml) · [`.github/workflows/copilot_pull_request.yml`](../.github/workflows/copilot_pull_request.yml) · [`.github/workflows/copilot_issue_comment.yml`](../.github/workflows/copilot_issue_comment.yml)
- Entrypoints: [`src/actions/agent_configuration_builder.ts`](../src/actions/agent_configuration_builder.ts) · [`src/actions/github_action_runtime.ts`](../src/actions/github_action_runtime.ts)
- Core code: [`src/domain/agent.ts`](../src/domain/agent.ts) · [`src/application/policies/agent_task_activation_policy.ts`](../src/application/policies/agent_task_activation_policy.ts) · [`src/application/policies/agent_configuration_validation_policy.ts`](../src/application/policies/agent_configuration_validation_policy.ts) · [`src/data/repository/agent_runtime_environment.ts`](../src/data/repository/agent_runtime_environment.ts) · [`src/data/repository/agent_cli_provisioner.ts`](../src/data/repository/agent_cli_provisioner.ts) · [`src/data/repository/provider_specific_cli_adapters.ts`](../src/data/repository/provider_specific_cli_adapters.ts)
- Tests: [`src/actions/__tests__/agent_configuration_builder.test.ts`](../src/actions/__tests__/agent_configuration_builder.test.ts) · [`src/application/policies/__tests__/agent_task_activation_policy.test.ts`](../src/application/policies/__tests__/agent_task_activation_policy.test.ts) · [`src/data/repository/__tests__/agent_cli_client.test.ts`](../src/data/repository/__tests__/agent_cli_client.test.ts) · [`src/data/repository/__tests__/provider_specific_cli_adapters.test.ts`](../src/data/repository/__tests__/provider_specific_cli_adapters.test.ts)
- User documentation: [`docs/agents/execution-contract.mdx`](../docs/agents/execution-contract.mdx) · [`docs/agents/runtime-selection.mdx`](../docs/agents/runtime-selection.mdx) · [`docs/agents/model-selection.mdx`](../docs/agents/model-selection.mdx) · [`docs/agents/model-allowlists.mdx`](../docs/agents/model-allowlists.mdx) · [`docs/agents/failure-policy.mdx`](../docs/agents/failure-policy.mdx)

### `cli-and-single-actions` — CLI and single-action execution

- Owner: Copilot maintainers
- Last verified: 2026-09-11
- Specifications: [`specs/cli-and-single-action-execution.md`](./cli-and-single-action-execution.md)
- Workflows: Not applicable for this capability.
- Entrypoints: [`src/cli.ts`](../src/cli.ts) · [`src/cli/cli_program.ts`](../src/cli/cli_program.ts) · [`src/actions/local_action.ts`](../src/actions/local_action.ts) · [`src/application/usecases/single_action_use_case.ts`](../src/application/usecases/single_action_use_case.ts)
- Core code: [`src/cli/command_registry.ts`](../src/cli/command_registry.ts) · [`src/data/model/action_types.ts`](../src/data/model/action_types.ts) · [`src/data/model/single_action.ts`](../src/data/model/single_action.ts) · [`src/application/usecases/single_action_workflow.ts`](../src/application/usecases/single_action_workflow.ts) · [`src/actions/local_action_output.ts`](../src/actions/local_action_output.ts)
- Tests: [`src/cli/__tests__/cli_program.test.ts`](../src/cli/__tests__/cli_program.test.ts) · [`src/cli/__tests__/cli_entrypoint_boundaries.test.ts`](../src/cli/__tests__/cli_entrypoint_boundaries.test.ts) · [`src/actions/__tests__/local_action.test.ts`](../src/actions/__tests__/local_action.test.ts) · [`src/application/usecases/__tests__/single_action_use_case.test.ts`](../src/application/usecases/__tests__/single_action_use_case.test.ts)
- User documentation: [`docs/single-actions/available-actions.mdx`](../docs/single-actions/available-actions.mdx) · [`docs/single-actions/workflow-and-cli.mdx`](../docs/single-actions/workflow-and-cli.mdx) · [`docs/single-actions/configuration.mdx`](../docs/single-actions/configuration.mdx) · [`docs/agents/cli-commands.mdx`](../docs/agents/cli-commands.mdx)

## Maintenance contract

1. Read the relevant SDD before changing a catalogued capability.
2. Change the SDD, catalog evidence, tests, and user documentation together when
   behavior or an architecture boundary changes.
3. Use repository-relative paths in `catalog.json`; each path is validated and every
   top-level product SDD must have exactly one capability owner.
4. Run `pnpm run validate:specifications` in local and CI validation.
