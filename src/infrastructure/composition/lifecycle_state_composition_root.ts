import { SynchronizeLifecycleStateUseCase } from '../../application/usecases/actions/synchronize_lifecycle_state_use_case';
import { createIssueLabelRepository } from './issue_labels_composition_root';
import { createPullRequestLifecycleClient } from './github_pull_request_client_factory';
import { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import { bindIssueLabels, bindPullRequestHeadSha } from './lifecycle_capability_port_binding';

export function createSynchronizeLifecycleStateUseCase(
    binding: RepositoryCredentialBinding,
): SynchronizeLifecycleStateUseCase {
    return new SynchronizeLifecycleStateUseCase(
        bindIssueLabels(createIssueLabelRepository(), binding),
        bindPullRequestHeadSha(
            new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
            binding,
        ),
    );
}
