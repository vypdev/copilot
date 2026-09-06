import { SynchronizeLifecycleStateUseCase } from '../../application/usecases/actions/synchronize_lifecycle_state_use_case';
import { createIssueLabelRepository } from './issue_labels_composition_root';
import { createPullRequestLifecycleClient } from './github_pull_request_client_factory';
import { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';

export function createSynchronizeLifecycleStateUseCase(): SynchronizeLifecycleStateUseCase {
    return new SynchronizeLifecycleStateUseCase(
        createIssueLabelRepository(),
        new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
    );
}
