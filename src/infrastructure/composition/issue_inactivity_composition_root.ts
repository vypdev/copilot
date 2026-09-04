import { CloseInactiveIssuesUseCase } from '../../application/usecases/actions/close_inactive_issues_use_case';
import { IssueInactivityRepository } from '../../data/repository/issue/issue_inactivity_repository';
import { SystemIssueInactivityClockAdapter } from '../time/system_issue_inactivity_clock_adapter';
import { createIssueInactivityClient } from './github_issue_client_factory';
import { createIssueClosureRepository } from './issue_interaction_composition_root';

export function createCloseInactiveIssuesUseCase(): CloseInactiveIssuesUseCase {
    return new CloseInactiveIssuesUseCase(
        new IssueInactivityRepository(createIssueInactivityClient()),
        createIssueClosureRepository(),
        new SystemIssueInactivityClockAdapter(),
    );
}
