import type { IssueNotificationPort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLifecycleRepository } from './issue_lifecycle_repository';

export class IssueNotificationRepository implements IssueNotificationPort {
    constructor(
        private readonly lifecycleRepository: IssueLifecycleRepository,
        private readonly contentRepository: IssueContentRepository,
    ) {}

    openIssue = (...args: Parameters<IssueLifecycleRepository['openIssue']>) => this.lifecycleRepository.openIssue(...args);
    addComment = (...args: Parameters<IssueContentRepository['addComment']>) => this.contentRepository.addComment(...args);
}
