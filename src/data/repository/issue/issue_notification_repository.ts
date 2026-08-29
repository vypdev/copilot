import type { IssueNotificationPort } from '../../../application/ports/issue_lifecycle_ports';

export class IssueNotificationRepository implements IssueNotificationPort {
    constructor(
        private readonly lifecycleRepository: Pick<IssueNotificationPort, 'openIssue'>,
        private readonly contentRepository: Pick<IssueNotificationPort, 'addComment'>,
    ) {}

    openIssue = (...args: Parameters<IssueNotificationPort['openIssue']>) => this.lifecycleRepository.openIssue(...args);
    addComment = (...args: Parameters<IssueNotificationPort['addComment']>) => this.contentRepository.addComment(...args);
}
