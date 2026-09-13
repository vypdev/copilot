import { SynchronizeAgentActivityUseCase } from '../../application/usecases/actions/synchronize_agent_activity_use_case';
import { createIssueLabelRepository } from './issue_labels_composition_root';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import { bindIssueLabels } from './lifecycle_capability_port_binding';

export function createSynchronizeAgentActivityUseCase(binding: RepositoryCredentialBinding): SynchronizeAgentActivityUseCase {
    return new SynchronizeAgentActivityUseCase(bindIssueLabels(createIssueLabelRepository(), binding));
}
