import { SynchronizeLifecycleStateUseCase } from '../../application/usecases/actions/synchronize_lifecycle_state_use_case';
import { createIssueLabelRepository } from './issue_labels_composition_root';

export function createSynchronizeLifecycleStateUseCase(): SynchronizeLifecycleStateUseCase {
    return new SynchronizeLifecycleStateUseCase(createIssueLabelRepository());
}

