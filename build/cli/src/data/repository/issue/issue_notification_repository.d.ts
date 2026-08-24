import type { IssueNotificationPort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLifecycleRepository } from './issue_lifecycle_repository';
export declare class IssueNotificationRepository implements IssueNotificationPort {
    private readonly lifecycleRepository;
    private readonly contentRepository;
    constructor(lifecycleRepository: IssueLifecycleRepository, contentRepository: IssueContentRepository);
    openIssue: (...args: Parameters<IssueLifecycleRepository["openIssue"]>) => Promise<boolean>;
    addComment: (...args: Parameters<IssueContentRepository["addComment"]>) => Promise<void>;
}
