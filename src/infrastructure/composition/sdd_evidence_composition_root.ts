import { SddEvidenceQueryUseCase } from '../../application/usecases/sdd/sdd_evidence_query_use_case';
import { bindSddEvidenceReadPorts, type SddEvidenceReadPorts, type SddEvidenceQueryPort } from '../../application/ports/sdd_evidence_read_ports';
import type { BoundBugbotContextReadPorts } from '../../application/ports/bugbot_context_ports';
import { LinkedBranchReadinessRepository } from '../../data/repository/branch/linked_branch_readiness_repository';
import { PreBranchSddWorkspaceAdapter } from '../pre_branch_sdd_workspace_adapter';
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import { createGraphqlTransportClient } from './github_project_client_factory';
import { createIssueMetadataCompositionRoot } from './issue_metadata_composition_root';
import { createIssueContentCompositionRoot } from './issue_content_composition_root';
import { createIssueLabelRepository } from './issue_labels_composition_root';
import { createActorAuthorizationRepository } from './actor_authorization_composition_root';
import { bindActorAuthorization, bindIssueLabels } from './lifecycle_capability_port_binding';
import { bindIssueDescriptionQuery } from './shared_capability_port_binding';

/** No provisioning, mutation, agent or approval capability crosses this binding. */
export function createSddEvidenceReadPorts(binding: BugbotScmBinding, comments: Pick<BoundBugbotContextReadPorts, 'listIssueComments'>): SddEvidenceReadPorts {
    const titles = createIssueMetadataCompositionRoot();
    const branches = new LinkedBranchReadinessRepository(createGraphqlTransportClient());
    return bindSddEvidenceReadPorts({
        comments,
        descriptions: bindIssueDescriptionQuery(createIssueContentCompositionRoot(), binding),
        titles: { getTitle: issueNumber => titles.getTitle(binding.owner, binding.repository, issueNumber, binding.token) },
        labels: bindIssueLabels(createIssueLabelRepository(), binding),
        actors: bindActorAuthorization(createActorAuthorizationRepository(), binding),
        branches: { getLinkedBranch: (issueNumber, name) => branches.getLinkedBranch(binding.owner, binding.repository, issueNumber, name, binding.token) },
        workspace: new PreBranchSddWorkspaceAdapter(process.cwd(), binding.token),
    });
}

export function createSddEvidenceQueryPort(binding: BugbotScmBinding, comments: Pick<BoundBugbotContextReadPorts, 'listIssueComments'>): SddEvidenceQueryPort {
    const query = new SddEvidenceQueryUseCase(createSddEvidenceReadPorts(binding, comments));
    return Object.freeze({ read: query.read.bind(query) });
}
