import { CloseInactiveIssuesUseCase } from '../../application/usecases/actions/close_inactive_issues_use_case';
import { IssueInactivityRepository } from '../../data/repository/issue/issue_inactivity_repository';
import { SystemIssueInactivityClockAdapter } from '../time/system_issue_inactivity_clock_adapter';
import { createIssueInactivityClient } from './github_issue_client_factory';
import { createIssueClosureRepository } from './issue_interaction_composition_root';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import { bindIssueClosure } from './lifecycle_capability_port_binding';
import { bindIssueInactivityQuery } from './push_single_action_capability_port_binding';
import type { MessageCatalogResolutionPort } from '../../application/ports/message_catalog_ports';

export function createCloseInactiveIssuesUseCase(
    binding: RepositoryCredentialBinding,
    catalogResolver?: MessageCatalogResolutionPort,
): CloseInactiveIssuesUseCase {
    return new CloseInactiveIssuesUseCase(
        bindIssueInactivityQuery(new IssueInactivityRepository(createIssueInactivityClient()), binding),
        bindIssueClosure(createIssueClosureRepository(), binding),
        new SystemIssueInactivityClockAdapter(),
        catalogResolver,
    );
}
