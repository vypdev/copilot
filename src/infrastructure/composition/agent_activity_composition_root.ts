import { SynchronizeAgentActivityUseCase } from '../../application/usecases/actions/synchronize_agent_activity_use_case';
import { createIssueLabelRepository } from './issue_labels_composition_root';

export function createSynchronizeAgentActivityUseCase(): SynchronizeAgentActivityUseCase {
    return new SynchronizeAgentActivityUseCase(createIssueLabelRepository());
}
